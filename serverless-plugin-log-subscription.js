'use strict';

module.exports = class LogSubscriptionsPlugin {
  constructor(serverless) {
    this.provider = serverless.getProvider('aws');
    this.serverless = serverless;
    this.hooks = {
      'aws:package:finalize:mergeCustomProviderResources': () => this.addLogSubscriptions(),
    };

    serverless.configSchemaHandler.defineFunctionProperties('aws', {
      properties: {
        logSubscription: { type: 'boolean' },
      },
    });
  }

  async addLogSubscriptions() {
    const service = this.serverless.service;
    const functions = service.functions;

    if (functions) {
      const custom = service.custom || {};
      const logSubscription = custom.logSubscription || {};

      if (!Array.isArray(logSubscription)) {
        this.addLambdaLogSubscription(service, functions, logSubscription);
        await this.addApiGatewayLogSubscription(service, logSubscription);
      } else {
        for (const index in logSubscription) {
          this.addLambdaLogSubscription(service, functions, logSubscription[index], index);
          await this.addApiGatewayLogSubscription(service, logSubscription[index], index);
        }
      }
    }
  }

  addLambdaLogSubscription(service, functions, logSubscription, suffix = '') {
    const aws = this.provider;
    const template = service.provider.compiledCloudFormationTemplate;

    template.Resources = template.Resources || {};

    Object.keys(functions).forEach(functionName => {
      const fn = functions[functionName];
      const config = this.getConfig(logSubscription, fn);

      if (config.enabled) {
        if (config.addSourceLambdaPermission) {
          throw new Error('addSourceLambdaPermission is no longer supported, see README');
        }

        const { destinationArn, filterPattern,  filterName } = config;
        const dependsOn = this.getDependsOn(destinationArn);
        const dependencies = [].concat(dependsOn || []);

        const normalizedFunctionName = aws.naming.getNormalizedFunctionName(functionName);
        const logicalId = `${normalizedFunctionName}SubscriptionFilter${suffix}`;
        const logGroupLogicalId = `${normalizedFunctionName}LogGroup`;
        const logGroupName = this.getLogGroupName(template, logGroupLogicalId);

        if (config.addLambdaPermission && this.isLambdaFunction(destinationArn, template)) {
          const permissionLogicalId = `${normalizedFunctionName}LogLambdaPermission`;
          const region = service.provider.region;
          const principal = `logs.${region}.amazonaws.com`;

          dependencies.push(permissionLogicalId);

          const lambdaPermission = {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              Action: 'lambda:InvokeFunction',
              FunctionName: destinationArn, // FunctionName can be an ARN too
              Principal: principal,
              SourceArn: {
                'Fn::GetAtt': [logGroupLogicalId, 'Arn'],
              },
            },
          };

          template.Resources[permissionLogicalId] = lambdaPermission;
        }

        dependencies.push(logGroupLogicalId);

        const subscriptionFilter = {
          Type: 'AWS::Logs::SubscriptionFilter',
          Properties: {
            DestinationArn: destinationArn,
            FilterPattern: filterPattern,
            LogGroupName: logGroupName,
            ...filterName && {FilterName: filterName},
          },
          DependsOn: dependencies,
        };

        if (config.roleArn !== undefined) {
          subscriptionFilter.Properties.RoleArn = config.roleArn;
        }

        template.Resources[logicalId] = subscriptionFilter;
      }
    });
  }

  async addApiGatewayLogSubscription(service, logSubscription, suffix = '') {
    const aws = this.provider;
    const region = service.provider.region;
    const template = service.provider.compiledCloudFormationTemplate;
    const config = this.getConfig(logSubscription);
    const stackName = this.provider.naming.getStackName();

    template.Resources = template.Resources || {};

    if (config.enabled && service.provider.logs?.restApi && config.apiGatewayLogs && this.provider.naming.getApiGatewayLogGroupLogicalId) {
      const { destinationArn, filterPattern, filterName } = config;
      const dependsOn = this.getDependsOn(destinationArn);
      const dependencies = [].concat(dependsOn || []);
      const { accessLogging = true, executionLogging = true } = service.provider.logs.restApi;
      const accessLogLambdaPermResourceName = `ApiGatewayLogGroupLambdaPermission${suffix}`;

      const isDeployed = await this.isDeployed(stackName);

      // If this is a new deployment, we pre-emptively create the execution logs group, this is normally created by AWS when Cloudwatch logs
      // are enabled for the API Gateway.
      if (!isDeployed && executionLogging) {
        const executionLogGroup = {
          Type: 'AWS::Logs::LogGroup',
          // If the group is created by AWS, it persists after the associated API Gateway is deleted, so we are
          // setting the DeletionPolicy to Retain to emulate this.
          DeletionPolicy: 'Retain',
          Properties: {
            LogGroupName: {
              'Fn::Sub': `API-Gateway-Execution-Logs_$\{${aws.naming.getRestApiLogicalId()}}/${
                this.serverless.service.provider.stage
              }`,
            },
          },
        };
        template.Resources['ApiGatewayExecutionLogGroup'] = executionLogGroup;
      }

      // Add permissions for our target Lambda to be invoked by the API gateway CW Log Groups
      if (config.addLambdaPermission && this.isLambdaFunction(destinationArn, template)) {
        const principal = `logs.${region}.amazonaws.com`;

        if (accessLogging) {
          const lambdaPermission = {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              Action: 'lambda:InvokeFunction',
              FunctionName: destinationArn,
              Principal: principal,
              SourceArn: {
                'Fn::GetAtt': [aws.naming.getApiGatewayLogGroupLogicalId(), 'Arn'],
              },
            },
          };
          template.Resources[accessLogLambdaPermResourceName] = lambdaPermission;
        }

        if (executionLogging) {
          const executionLogLambdaPermission = {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              Action: 'lambda:InvokeFunction',
              FunctionName: destinationArn,
              Principal: principal,
              SourceArn: {
                'Fn::Sub': `arn:aws:logs:\${AWS::Region}:\${AWS::AccountId}:log-group:API-Gateway-Execution-Logs_$\{${aws.naming.getRestApiLogicalId()}}/${
                  this.serverless.service.provider.stage
                }:*`,
              },
            },
          };
          template.Resources[`ApiGatewayExecutionLogGroupLambdaPermission${suffix}`] =
            executionLogLambdaPermission;
        }
      }

      if (accessLogging) {
        // Create the subscription filters
        const accessLogsubscriptionFilter = {
          Type: 'AWS::Logs::SubscriptionFilter',
          Properties: {
            DestinationArn: destinationArn,
            FilterPattern: filterPattern,
            ...filterName && {FilterName: filterName},
            LogGroupName: {
              Ref: aws.naming.getApiGatewayLogGroupLogicalId(),
            },
          },
          DependsOn: template.Resources[accessLogLambdaPermResourceName] ? [accessLogLambdaPermResourceName] : [],
        };
        template.Resources[`ApiGatewayAccessLogGroupSubscriptionFilter${suffix}`] =
          accessLogsubscriptionFilter;
      }

      if (executionLogging) {
        const executionLogsubscriptionFilter = {
          Type: 'AWS::Logs::SubscriptionFilter',
          Properties: {
            DestinationArn: destinationArn,
            FilterPattern: filterPattern,
            ...filterName && {FilterName: filterName},
            LogGroupName: {
              'Fn::Sub': `API-Gateway-Execution-Logs_$\{${aws.naming.getRestApiLogicalId()}}/${
                this.serverless.service.provider.stage
              }`,
            },
          },
          DependsOn: [
            ...dependencies,
            aws.naming.generateApiGatewayDeploymentLogicalId(this.serverless.instanceId),
          ],
        };
        template.Resources[`ApiGatewayExecutionLogGroupSubscriptionFilter${suffix}`] =
          executionLogsubscriptionFilter;
      }
    }
  }

  getLogGroupName(template, logGroupLogicalId) {
    const logGroupResource = template.Resources[logGroupLogicalId];

    if (logGroupResource) {
      if (logGroupResource.Type === 'AWS::Logs::LogGroup') {
        if (logGroupResource.Properties && logGroupResource.Properties.LogGroupName) {
          return logGroupResource.Properties.LogGroupName;
        }

        throw new Error(`${logGroupLogicalId} did not have Properties.LogGroupName`);
      }

      throw new Error(
        `Expected ${logGroupLogicalId} to have a Type of AWS::Logs::LogGroup but got ${logGroupResource.Type}`
      );
    }

    throw new Error(`Could not find log group resource ${logGroupLogicalId}`);
  }

  getConfig(common, fn) {
    const defaults = {
      enabled: false,
      filterPattern: '',
      addLambdaPermission: true,
      apiGatewayLogs: false,
    };

    const config = Object.assign(defaults, common);

    if (typeof fn === 'undefined' || fn.logSubscription === undefined) {
      return config;
    }

    const functionConfig = {};

    if (typeof fn.logSubscription === 'object') {
      Object.assign(functionConfig, fn.logSubscription);
    } else {
      functionConfig.enabled = !!fn.logSubscription;
    }

    return Object.assign(config, functionConfig);
  }

  getDependsOn(destinationArn) {
    if (destinationArn && typeof destinationArn === 'object') {
      if (destinationArn['Fn::GetAtt'] && destinationArn['Fn::GetAtt'][1].toLowerCase() === 'arn') {
        return destinationArn['Fn::GetAtt'][0];
      } else if (destinationArn.Ref) {
        return destinationArn.Ref;
      }
    }
  }

  isLambdaFunction(destinationArn, template) {
    if (typeof destinationArn === 'string') {
      return destinationArn.indexOf('arn:aws:lambda') === 0;
    }

    const id = this.getDependsOn(destinationArn);

    return id && template.Resources[id].Type === 'AWS::Lambda::Function';
  }

  // isDeployed calls AWS to see if a CloudFormation stack with the same name already exists, if so
  // then we can safely assume that this is a pre-existing deployment.
  async isDeployed(stackName) {
    let res;
    try {
      res = await this.provider.request('CloudFormation', 'describeStacks', {
        StackName: stackName,
      });
    } catch (err) {
      if (err.message.includes('does not exist')) {
        return false; // If stack doesn't exist it will throw an error, catching it here returning false
      }
      throw err;
    }

    return res.Stacks.length > 0;
  }
};
