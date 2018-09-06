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

      const aws = this.serverless.getProvider('aws');
      const template = service.provider.compiledCloudFormationTemplate;

      template.Resources = template.Resources || {};


      Object.keys(functions).forEach(functionName => {
        const fn = functions[functionName];
        const config = this.getConfig(logSubscription, fn);
        const dependsOn = this.getDependsOn(config);

        if (config.enabled) {
          const normalizedFunctionName = aws.naming.getNormalizedFunctionName(functionName);

          const logicalId = `${normalizedFunctionName}SubscriptionFilter`;
          const logGroupLogicalId = `${normalizedFunctionName}LogGroup`;
          const logGroupName = this.getLogGroupName(template, logGroupLogicalId);

          const resource = {
            Type: "AWS::Logs::SubscriptionFilter",
            Properties: {
              DestinationArn: config.destinationArn,
              FilterPattern: config.filterPattern,
              LogGroupName: logGroupName
            },
            DependsOn: [logGroupLogicalId].concat(dependsOn || [])
          };
          if (config.addSourceLambdaPermission) {
            const permissionLogicalId = `${normalizedFunctionName}LogLambdaPermission`;
            const region = service.provider.region;
            const accountId = service.provider.accountId
            const principal = `logs.${region}.amazonaws.com`;
            const permissionResource = {
              Type: "AWS::Lambda::Permission",
              Properties: {
                Action: "lambda:InvokeFunction",
                FunctionName: config.destinationArn,
                Principal: principal,
                SourceArn: {
                  "Fn::GetAtt": [
                    logGroupLogicalId,
                    "Arn"
                  ]
                }
              }
            };
            template.Resources[permissionLogicalId] = permissionResource;
          }

          if (config.roleArn !== undefined) {
            resource.Properties.RoleArn = config.roleArn;
          }

          template.Resources[logicalId] = resource;
        }
      });
    }
  }

  getLogGroupArn(template, logGroupLogicalId) {
    const logGroupResource = template.Resources[logGroupLogicalId];

    if (logGroupResource) {
      if (logGroupResource.Type === 'AWS::Logs::LogGroup') {
        if (logGroupResource.Properties && logGroupResource.Properties.LogGroupArn) {
          return logGroupResource.Properties.LogGroupArn;
        }

        throw new Error(`${logGroupLogicalId} did not have Properties.LogGroupArn`);
      }

      throw new Error(`Expected ${logGroupLogicalId} to have a Type of AWS::Logs::LogGroup but got ${logGroupResource.Type}`);
    }

    throw new Error(`Could not find log group resource ${logGroupLogicalId}`);
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
      addSourceLambdaPermission: false
    };

    const config = Object.assign(defaults, common);

    if (fn.logSubscription === undefined) {
      return config;
    }

    const functionConfig = {};

    if (typeof fn.logSubscription === 'object') {
      Object.assign(functionConfig, fn.logSubscription);
    } else {
      functionConfig.enabled =  !!fn.logSubscription;
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

};
