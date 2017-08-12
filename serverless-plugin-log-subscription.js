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

      const aws = this.serverless.getProvider('aws');
      const template = service.provider.compiledCloudFormationTemplate;

      template.Resources = template.Resources || {};

      Object.keys(functions).forEach(functionName => {
        const fn = functions[functionName];
        const config = this.getConfig(custom.logSubscription, fn);

        if (config.enabled) {
          const key = `${aws.naming.normalizeName(functionName)}SubscriptionFilter`;

          template.Resources[key] = {
            Type: "AWS::Logs::SubscriptionFilter",
            Properties: {
              DestinationArn: config.destinationArn,
              FilterPattern: config.filterPattern,
              LogGroupName: config.logGroupName
            }
          };
        }
      });
    }
  }

  getConfig(global, fn) {
    const defaults = {
      enabled: false,
      logGroupName: `/aws/lambda/${fn.name}`,
      filterPattern: ''
    };

    const config = Object.assign(defaults, global);

    if (fn.logSubscription === undefined) {
      return config;
    }

    const functionConfig = { enabled : true };

    if (fn.logSubscription) {
      if (typeof fn.logSubscription === 'object') {
        Object.assign(functionConfig, fn.logSubscription);
      }
    } else {
      functionConfig.enabled = false;
    }

    return Object.assign(config, functionConfig);
  }

};
