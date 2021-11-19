"use strict";

const {
  CloudFormationClient,
  DescribeStacksCommand,
} = require("@aws-sdk/client-cloudformation");

module.exports = class LogSubscriptionsPlugin {
  constructor(serverless) {
    this.provider = "aws";
    this.serverless = serverless;
    this.stage = serverless.service.provider.stage;
    this.hooks = {
      "aws:package:finalize:mergeCustomProviderResources": () =>
        this.addLogSubscriptions(),
    };

    serverless.configSchemaHandler.defineFunctionProperties(this.provider, {
      properties: {
        logSubscription: { type: "boolean" },
      },
    });
  }

  async addLogSubscriptions() {
    const service = this.serverless.service;
    const functions = service.functions;
    const apigw =
      typeof this.serverless.service.provider.compiledCloudFormationTemplate
        .Resources?.ApiGatewayRestApi !== "undefined";

    if (functions) {
      const custom = service.custom || {};
      const logSubscription = custom.logSubscription || {};

      if (!Array.isArray(logSubscription)) {
        this.addLambdaLogSubscription(service, functions, logSubscription);
      } else {
        for (const index in logSubscription) {
          this.addLambdaLogSubscription(
            service,
            functions,
            logSubscription[index],
            index
          );
        }
      }
    }

    if (apigw && service.custom.logSubscription?.enableApiGatewayLogs) {
      const custom = service.custom || {};
      const logSubscription = custom.logSubscription || {};
      await this.addApiGatewayLogSubscription(service, logSubscription);
    }
  }

  addLambdaLogSubscription(service, functions, logSubscription, suffix = "") {
    const aws = this.serverless.getProvider("aws");
    const template = service.provider.compiledCloudFormationTemplate;

    template.Resources = template.Resources || {};

    Object.keys(functions).forEach((functionName) => {
      const fn = functions[functionName];
      const config = this.getConfig(logSubscription, fn); // Returns default settings if lambda has no specific config

      if (config.enabled) {
        if (config.addSourceLambdaPermission) {
          throw new Error(
            "addSourceLambdaPermission is no longer supported, see README"
          );
        }

        const { destinationArn, filterPattern } = config;
        const dependsOn = this.getDependsOn(destinationArn);
        const dependencies = [].concat(dependsOn || []);

        const normalizedFunctionName =
          aws.naming.getNormalizedFunctionName(functionName);
        const logicalId = `${normalizedFunctionName}SubscriptionFilter${suffix}`;
        const logGroupLogicalId = `${normalizedFunctionName}LogGroup`;
        const logGroupName = this.getLogGroupName(template, logGroupLogicalId);

        if (
          config.addLambdaPermission &&
          this.isLambdaFunction(destinationArn, template)
        ) {
          const permissionLogicalId = `${normalizedFunctionName}LogLambdaPermission`;
          const region = service.provider.region;
          const principal = `logs.${region}.amazonaws.com`;

          dependencies.push(permissionLogicalId);

          const lambdaPermission = {
            Type: "AWS::Lambda::Permission",
            Properties: {
              Action: "lambda:InvokeFunction",
              FunctionName: destinationArn, // FunctionName can be an ARN too
              Principal: principal,
              SourceArn: {
                "Fn::GetAtt": [logGroupLogicalId, "Arn"],
              },
            },
          };

          template.Resources[permissionLogicalId] = lambdaPermission;
        }

        dependencies.push(logGroupLogicalId);

        const subscriptionFilter = {
          Type: "AWS::Logs::SubscriptionFilter",
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
    const aws = this.serverless.getProvider("aws");
    const region = service.provider.region;
    const template = service.provider.compiledCloudFormationTemplate;
    const config = this.getConfig(logSubscription);

    template.Resources = template.Resources || {};

    const { destinationArn, filterPattern } = config;
    const dependsOn = this.getDependsOn(destinationArn);
    const dependencies = [].concat(dependsOn || []);

    // Check Cloudformation to see if we have already deployed the Stack
    const stackName = this.serverless.getProvider("aws").naming.getStackName();
    const cfnClient = new CloudFormationClient();
    const cmd = new DescribeStacksCommand({ StackName: stackName });
    const res = await cfnClient.send(cmd);
    const isDeployed = res.Stacks.length > 0;

    // If this is a new deployment, we pre-emptively create the execution logs group, this is normally created by AWS when Cloudwatch logs
    // are enabled for the API Gateway.
    if (!isDeployed) {
      const executionLogGroup = {
        Type: "AWS::Logs::LogGroup",
        DeletionPolicy: "Retain",
        Properties: {
          LogGroupName: {
            "Fn::Sub": `API-Gateway-Execution-Logs_\$\{${aws.naming.getRestApiLogicalId()}\}/${
              this.stage
            }`,
          },
        },
      };
      template.Resources["ApiGatewayExecutionLogGroup"] = executionLogGroup;
    }

    // Add permissions for our target Lambda to be invoked by the API gateway CW Log Groups
    if (config.addLambdaPermission) {
      const permissionLogicalId = `ApiGatewayLogGroupLambdaPermission`;
      const executionLogPermissionLogicalId = `ApiGatewayExecutionLogGroupLambdaPermission`;
      const principal = `logs.${region}.amazonaws.com`;

      const lambdaPermission = {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: destinationArn,
          Principal: principal,
          SourceArn: {
            "Fn::GetAtt": [aws.naming.getApiGatewayLogGroupLogicalId(), "Arn"],
          },
        },
      };
      template.Resources[permissionLogicalId] = lambdaPermission;
      dependencies.push(permissionLogicalId);

      const executionLogLambdaPermission = {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: destinationArn,
          Principal: principal,
          SourceArn: {
            "Fn::Sub": `arn:aws:logs:\${AWS::Region}:\${AWS::AccountId}:log-group:API-Gateway-Execution-Logs_\$\{${aws.naming.getRestApiLogicalId()}\}/${
              this.stage
            }:*`,
          },
        },
      };
      template.Resources[executionLogPermissionLogicalId] =
        executionLogLambdaPermission;
      dependencies.push(executionLogPermissionLogicalId);
    }

    // Create the subscription filters
    const accessLogsubscriptionFilter = {
      Type: "AWS::Logs::SubscriptionFilter",
      Properties: {
        DestinationArn: destinationArn,
        FilterPattern: filterPattern,
        LogGroupName: {
          Ref: aws.naming.getApiGatewayLogGroupLogicalId(),
        },
      },
      DependsOn: dependencies,
    };
    template.Resources["ApiGatewayAccessLogGroupSubscriptionFilter"] =
      accessLogsubscriptionFilter;

    const executionLogsubscriptionFilter = {
      Type: "AWS::Logs::SubscriptionFilter",
      Properties: {
        DestinationArn: destinationArn,
        FilterPattern: filterPattern,
        LogGroupName: {
          "Fn::Sub": `API-Gateway-Execution-Logs_\$\{${aws.naming.getRestApiLogicalId()}\}/${
            this.stage
          }`,
        },
      },
      DependsOn: [
        ...dependencies,
        aws.naming.generateApiGatewayDeploymentLogicalId(
          this.serverless.instanceId
        ),
      ],
    };
    template.Resources["ApiGatewayExecutionLogGroupSubscriptionFilter"] =
      executionLogsubscriptionFilter;
  }

  getLogGroupName(template, logGroupLogicalId) {
    const logGroupResource = template.Resources[logGroupLogicalId];

    if (logGroupResource) {
      if (logGroupResource.Type === "AWS::Logs::LogGroup") {
        if (
          logGroupResource.Properties &&
          logGroupResource.Properties.LogGroupName
        ) {
          return logGroupResource.Properties.LogGroupName;
        }

        throw new Error(
          `${logGroupLogicalId} did not have Properties.LogGroupName`
        );
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
      filterPattern: "",
      addLambdaPermission: true,
    };

    const config = Object.assign(defaults, common);

    if (typeof fn === "undefined" || fn.logSubscription === undefined) {
      return config;
    }

    const functionConfig = {};

    if (typeof fn.logSubscription === "object") {
      Object.assign(functionConfig, fn.logSubscription);
    } else {
      functionConfig.enabled = !!fn.logSubscription;
    }

    return Object.assign(config, functionConfig);
  }

  getDependsOn(destinationArn) {
    if (destinationArn && typeof destinationArn === "object") {
      if (
        destinationArn["Fn::GetAtt"] &&
        destinationArn["Fn::GetAtt"][1].toLowerCase() === "arn"
      ) {
        return destinationArn["Fn::GetAtt"][0];
      } else if (destinationArn.Ref) {
        return destinationArn.Ref;
      }
    }
  }

  isLambdaFunction(destinationArn, template) {
    if (typeof destinationArn === "string") {
      return destinationArn.indexOf("arn:aws:lambda") === 0;
    }

    const id = this.getDependsOn(destinationArn);

    return id && template.Resources[id].Type === "AWS::Lambda::Function";
  }
};
