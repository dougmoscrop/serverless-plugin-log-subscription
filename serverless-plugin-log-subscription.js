'use strict';

module.exports = class LogSubscriptionsPlugin {
  constructor(serverless) {
    this.provider = serverless.getProvider('aws');
    this.serverless = serverless;
    this.hooks = {
      'aws:package:finalize:mergeCustomProviderResources': () => this.addLogSubscriptions(),
    };

    serverless.configSchemaHandler.defineFunctionProperties(this.provider, {
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
      } else {
        for (const index in logSubscription) {
          this.addLambdaLogSubscription(service, functions, logSubscription[index], index);
        }
      }
    }

    const apiGateway = service.functions && this.provider.naming.getApiGatewayLogGroupLogicalId;

    if (apiGateway && service.provider.logs.restApi) {
      const custom = service.custom || {};
      const logSubscription = custom.logSubscription || {};
      await this.addApiGatewayLogSubscription(service, logSubscription);
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

        const { destinationArn, filterPattern } = config;
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

  async addApiGatewayLogSubscription(service, logSubscription) {
    const aws = this.provider;
    const region = service.provider.region;
    const template = service.provider.compiledCloudFormationTemplate;
    const stackName = this.provider.naming.getStackName();
    const config = this.getConfig(logSubscription);
    const { access, execution } = config.apiGatewayLogs;
    const principal = `logs.${region}.amazonaws.com`;

    template.Resources = template.Resources || {};

    const { destinationArn, filterPattern } = config;
    const isDeployed = await this.isDeployed(stackName);

    // Handle creating the subscription filter for the access log group
    if (service.provider.logs.restApi.accessLogging && access) {
      if (config.addLambdaPermission) {
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
          DependsOn: ['ApiGatewayLogGroup'],
        };
        template.Resources['ApiGatewayLogGroupLambdaPermission'] = lambdaPermission;
      }

      // Create the subscription filters
      const accessLogsubscriptionFilter = {
        Type: 'AWS::Logs::SubscriptionFilter',
        Properties: {
          DestinationArn: destinationArn,
          FilterPattern: filterPattern,
          LogGroupName: {
            Ref: aws.naming.getApiGatewayLogGroupLogicalId(),
          },
        },
        ...(config.addLambdaPermission && { DependsOn: ['ApiGatewayLogGroupLambdaPermission'] }),
      };

      template.Resources['ApiGatewayAccessLogGroupSubscriptionFilter'] =
        accessLogsubscriptionFilter;
    }

    // Handle creating the filter for the execution log group
    if (service.provider.logs.restApi.executionLogging && execution) {
      if (isDeployed) {
        const apiGatewayId = await this.getRestApiId(aws.naming.getApiGatewayName());

        const executionLogGroupExists = await this.isExecutionLogGroupCreated(
          apiGatewayId,
          aws.options.stage
        );

        if (!executionLogGroupExists) {
          const executionLogGroup = {
            Type: 'AWS::Logs::LogGroup',
            DeletionPolicy: 'Retain',
            Properties: {
              LogGroupName: {
                'Fn::Sub': `API-Gateway-Execution-Logs_$\{${aws.naming.getRestApiLogicalId()}}/${
                  aws.options.stage
                }`,
              },
            },
          };
          template.Resources['ApiGatewayExecutionLogGroup'] = executionLogGroup;
        }
      } else {
        // If this is a new deployment, we pre-emptively create the execution logs group, this is normally
        // created by AWS when Cloudwatch logs are enabled for the API Gateway.
        const executionLogGroup = {
          Type: 'AWS::Logs::LogGroup',
          DeletionPolicy: 'Retain',
          Properties: {
            LogGroupName: {
              'Fn::Sub': `API-Gateway-Execution-Logs_$\{${aws.naming.getRestApiLogicalId()}}/${
                aws.options.stage
              }`,
            },
          },
        };
        template.Resources['ApiGatewayExecutionLogGroup'] = executionLogGroup;
      }

      if (config.addLambdaPermission) {
        const executionLogLambdaPermission = {
          Type: 'AWS::Lambda::Permission',
          Properties: {
            Action: 'lambda:InvokeFunction',
            FunctionName: destinationArn,
            Principal: principal,
            SourceArn: {
              'Fn::Sub': `arn:aws:logs:\${AWS::Region}:\${AWS::AccountId}:log-group:API-Gateway-Execution-Logs_$\{${aws.naming.getRestApiLogicalId()}}/${
                aws.options.stage
              }:*`,
            },
          },
        };

        template.Resources['ApiGatewayExecutionLogGroupLambdaPermission'] =
          executionLogLambdaPermission;
      }

      const executionLogsubscriptionFilter = {
        Type: 'AWS::Logs::SubscriptionFilter',
        Properties: {
          DestinationArn: destinationArn,
          FilterPattern: filterPattern,
          LogGroupName: {
            'Fn::Sub': `API-Gateway-Execution-Logs_$\{${aws.naming.getRestApiLogicalId()}}/${
              aws.options.stage
            }`,
          },
        },
        DependsOn: [
          ...(config.addLambdaPermission && ['ApiGatewayExecutionLogGroupLambdaPermission']),
          aws.naming.generateApiGatewayDeploymentLogicalId(this.serverless.instanceId),
        ],
      };
      template.Resources['ApiGatewayExecutionLogGroupSubscriptionFilter'] =
        executionLogsubscriptionFilter;
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
      apiGatewayLogs: {
        access: false,
        execution: false,
      },
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

  // getRestApiId is run if the CloudFormation stack is already deployed, this allows
  // us to check for the existence of the API Gateway Execution log group
  async getRestApiId(restApiName) {
    let res, match, token;
    try {
      let i = 0;
      while (!match) {
        i = i + 1;
        res = await this.provider.request('APIGateway', 'getRestApis', {
          limit: 1,
          ...(token && { position: token }),
        });
        token = res.position;
        match = res.items.find(i => i.name === restApiName);
        if (typeof match !== 'undefined') {
          return match.id;
        }
      }
    } catch (err) {
      console.log(err);
      throw err;
    }
  }

  // isExecutionLogGroupCreated checks for the existence of the Execution CloudWatch Log Group
  // and returns true/false
  async isExecutionLogGroupCreated(restApiId, stage) {
    let res;
    try {
      res = await this.provider.request('CloudWatchLogs', 'describeLogGroups', {
        logGroupNamePrefix: `API-Gateway-Execution-Logs_${restApiId}/${stage}`,
      });
    } catch (err) {
      console.log(err);
      throw err;
    }
    return res.logGroups.length > 0;
  }
};
