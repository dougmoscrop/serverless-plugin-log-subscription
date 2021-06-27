'use strict';

module.exports = class LogSubscriptionsPlugin {

  constructor(serverless) {
    this.provider = 'aws';
    this.serverless = serverless;
    this.hooks = {
      'aws:package:finalize:mergeCustomProviderResources': () => this.addLogSubscriptions()
    };
  }

  addLogSubscriptions() {
    const service = this.serverless.service;
    const functions = service.functions;

    if (functions) {
      const custom = service.custom || {};
      const logSubscription = custom.logSubscription || {};

      if (!Array.isArray(logSubscription)) {
        this.addLogSubscription(service, functions, logSubscription);
      } else {
        for (const index in logSubscription) {
          this.addLogSubscription(service, functions, logSubscription[index], index);
        }
      }
    }
  }

  addLogSubscription(service, functions, logSubscription, suffix = '') {
    const aws = this.serverless.getProvider('aws');
    const template = service.provider.compiledCloudFormationTemplate;

    template.Resources = template.Resources || {};

    Object.keys(functions).forEach(functionName => {
      const fn = functions[functionName];
      const config = this.getConfig(logSubscription, fn);
      const dependsOn = this.getDependsOn(config);
      const dependencies = [].concat(dependsOn || []);

      if (config.enabled) {
        if (config.addSourceLambdaPermission) {
          throw new Error('addSourceLambdaPermission is no longer supported, see README');
        }

        const normalizedFunctionName = aws.naming.getNormalizedFunctionName(functionName);

        const logicalId = `${normalizedFunctionName}SubscriptionFilter${suffix}`;
        const logGroupLogicalId = `${normalizedFunctionName}LogGroup`;
        const logGroupName = this.getLogGroupName(template, logGroupLogicalId);

        if (config.addLambdaPermission && this.isLambdaFunction(dependsOn, template)) {
          const permissionLogicalId = `${normalizedFunctionName}LogLambdaPermission`;
          const region = service.provider.region;
          const principal = `logs.${region}.amazonaws.com`;

          dependencies.push(permissionLogicalId);

          const lambdaPermission = {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              Action: 'lambda:InvokeFunction',
              FunctionName: {
                Ref: dependsOn,
              },
              Principal: principal,
              SourceArn: {
                'Fn::GetAtt': [
                  logGroupLogicalId,
                  'Arn'
                ]
              }
            },
          };

          template.Resources[permissionLogicalId] = lambdaPermission;
        }

        dependencies.push(logGroupLogicalId);

        const subscriptionFilter = {
          Type: 'AWS::Logs::SubscriptionFilter',
          Properties: {
            DestinationArn: config.destinationArn,
            FilterPattern: config.filterPattern,
            LogGroupName: logGroupName
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

  getLogGroupName(template, logGroupLogicalId) {
    const logGroupResource = template.Resources[logGroupLogicalId];

    if (logGroupResource) {
      if (logGroupResource.Type === 'AWS::Logs::LogGroup') {
        if (logGroupResource.Properties && logGroupResource.Properties.LogGroupName) {
          return logGroupResource.Properties.LogGroupName;
        }

        throw new Error(`${logGroupLogicalId} did not have Properties.LogGroupName`);
      }

      throw new Error(`Expected ${logGroupLogicalId} to have a Type of AWS::Logs::LogGroup but got ${logGroupResource.Type}`);
    }

    throw new Error(`Could not find log group resource ${logGroupLogicalId}`);
  }

  getConfig(common, fn) {
    const defaults = {
      enabled: false,
      filterPattern: '',
      addLambdaPermission: true
    };

    const config = Object.assign(defaults, common);

    if (fn.logSubscription === undefined) {
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

  getDependsOn(config) {
    if (config.destinationArn && typeof config.destinationArn === 'object') {
      if (config.destinationArn['Fn::GetAtt'] && config.destinationArn['Fn::GetAtt'][1].toLowerCase() === 'arn') {
        return config.destinationArn['Fn::GetAtt'][0];
      } else if (config.destinationArn.Ref) {
        return config.destinationArn.Ref;
      }
    }
  }

  isLambdaFunction(dependsOn, template) {
    return template.Resources[dependsOn].Type === 'AWS::Lambda::Function';
  }

};
