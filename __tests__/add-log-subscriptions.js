'use strict';

const sinon = require('sinon');
const test = require('ava');

const Plugin = require('..');

test('does nothing when there are no functions', t => {
  const serverless = {
    getProvider: sinon.stub().withArgs('aws').returns({}),
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
    service: {},
  };

  const plugin = new Plugin(serverless);

  plugin.addLogSubscriptions();

  t.pass();
});

test('adds subscriptions for enabled functions', t => {
  const getNormalizedFunctionName = sinon.stub().onCall(0).returns('A').onCall(1).returns('B');
  const getStackName = sinon.stub().returns('testing-cfn-stack');

  const provider = {
    naming: {
      getNormalizedFunctionName,
      getStackName,
    },
  };
  const serverless = {
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
    getProvider: sinon.stub().withArgs('aws').returns(provider),
    service: {
      provider: {
        compiledCloudFormationTemplate: {},
      },
      functions: {
        A: {},
        B: {},
        C: {},
      },
    },
  };

  const plugin = new Plugin(serverless);

  sinon
    .stub(plugin, 'getConfig')
    .returns({ enabled: false })
    .onCall(0)
    .returns({ enabled: true })
    .onCall(1)
    .returns({ enabled: true })
    .onCall(2)
    .returns({ enabled: false });

  sinon
    .stub(plugin, 'getLogGroupName')
    .onCall(0)
    .returns('LogGroupA')
    .onCall(1)
    .returns('LogGroupB');

  plugin.addLogSubscriptions();

  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  t.deepEqual(Object.keys(resources), ['ASubscriptionFilter', 'BSubscriptionFilter']);
  t.deepEqual(resources.ASubscriptionFilter.Type, 'AWS::Logs::SubscriptionFilter');
  t.deepEqual(resources.BSubscriptionFilter.Type, 'AWS::Logs::SubscriptionFilter');
});

test('configures the subscription filter correctly', t => {
  const getNormalizedFunctionName = sinon.stub().returns('A');
  const getStackName = sinon.stub().returns('testing-cfn-stack');

  const provider = {
    naming: {
      getNormalizedFunctionName,
      getStackName,
    },
  };
  const serverless = {
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
    getProvider: sinon.stub().withArgs('aws').returns(provider),
    service: {
      provider: {
        compiledCloudFormationTemplate: {},
      },
      functions: {
        A: {
          name: 'a',
        },
      },
    },
  };

  const plugin = new Plugin(serverless);

  sinon.stub(plugin, 'getConfig').returns({
    enabled: true,
    destinationArn: 'blah-blah-blah',
    filterPattern: '{ $.level = 42 }',
    filterName: 'a-custom-filter-name'
  });

  sinon.stub(plugin, 'getLogGroupName').returns('/aws/lambda/a');

  plugin.addLogSubscriptions();

  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  t.deepEqual(resources.ASubscriptionFilter.Properties, {
    DestinationArn: 'blah-blah-blah',
    FilterPattern: '{ $.level = 42 }',
    LogGroupName: '/aws/lambda/a',
    FilterName: 'a-custom-filter-name',
  });
});

test('configures the subscription filter with RoleArn correctly', t => {
  const getNormalizedFunctionName = sinon.stub().returns('A');
  const getStackName = sinon.stub().returns('testing-cfn-stack');

  const provider = {
    naming: {
      getNormalizedFunctionName,
      getStackName,
    },
  };
  const serverless = {
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
    getProvider: sinon.stub().withArgs('aws').returns(provider),
    service: {
      provider: {
        compiledCloudFormationTemplate: {},
      },
      functions: {
        A: {
          name: 'a',
        },
      },
    },
  };

  const plugin = new Plugin(serverless);

  sinon.stub(plugin, 'getConfig').returns({
    enabled: true,
    destinationArn: 'blah-blah-blah',
    filterPattern: '{ $.level = 42 }',
    roleArn: 'arn:foo:bar:baz',
  });

  sinon.stub(plugin, 'getLogGroupName').returns('/aws/lambda/a');

  plugin.addLogSubscriptions();

  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  t.deepEqual(resources.ASubscriptionFilter.Properties, {
    DestinationArn: 'blah-blah-blah',
    FilterPattern: '{ $.level = 42 }',
    LogGroupName: '/aws/lambda/a',
    RoleArn: 'arn:foo:bar:baz',
  });
});

test('configures the subscription filter with DependsOn the log group', t => {
  const getNormalizedFunctionName = sinon.stub().returns('A');
  const getStackName = sinon.stub().returns('testing-cfn-stack');

  const provider = {
    naming: {
      getNormalizedFunctionName,
      getStackName,
    },
  };
  const serverless = {
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
    getProvider: sinon.stub().withArgs('aws').returns(provider),
    service: {
      provider: {
        compiledCloudFormationTemplate: {},
      },
      functions: {
        A: {
          name: 'a',
        },
      },
    },
  };

  const plugin = new Plugin(serverless);

  sinon.stub(plugin, 'getConfig').returns({
    enabled: true,
    destinationArn: 'blah-blah-blah',
    filterPattern: '{ $.level = 42 }',
    roleArn: 'arn:foo:bar:baz',
  });

  sinon.stub(plugin, 'getLogGroupName').returns('/aws/lambda/a');

  plugin.addLogSubscriptions();

  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  t.deepEqual(resources.ASubscriptionFilter.DependsOn, ['ALogGroup']);
});

test('configures the subscription filter with DependsOn the lambda function', t => {
  const getNormalizedFunctionName = sinon.stub().returns('A');
  const getStackName = sinon.stub().returns('testing-cfn-stack');

  const provider = {
    naming: {
      getNormalizedFunctionName,
      getStackName,
    },
  };
  const serverless = {
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
    getProvider: sinon.stub().withArgs('aws').returns(provider),
    service: {
      provider: {
        compiledCloudFormationTemplate: {},
      },
      functions: {
        A: {
          name: 'a',
        },
        B: {
          name: 'b',
          logSubscription: {
            enabled: false,
          },
        },
      },
    },
  };

  const plugin = new Plugin(serverless);

  sinon.stub(plugin, 'getConfig').returns({
    enabled: true,
    destinationArn: {
      'Fn::GetAtt': ['BLambdaFunction', 'Arn'],
    },
    filterPattern: '{ $.level = 42 }',
    roleArn: 'arn:foo:bar:baz',
  });

  sinon.stub(plugin, 'getLogGroupName').returns('/aws/lambda/a');

  plugin.addLogSubscriptions();

  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  t.deepEqual(resources.ASubscriptionFilter.DependsOn, ['BLambdaFunction', 'ALogGroup']);
});

test('configures api gateway log subscriptions without creating Execution Log group if pre-existing stack', async t => {
  const getNormalizedFunctionName = sinon.stub().returns('A');
  const getRestApiLogicalId = sinon.stub().returns('abcd1234');
  const getApiGatewayLogGroupLogicalId = sinon.stub().returns('ApiGatewayLogGroup');
  const generateApiGatewayDeploymentLogicalId = sinon.stub().returns('ApiGatewayDeployment1234');
  const getStackName = sinon.stub().returns('testing-cfn-stack');

  const provider = {
    naming: {
      getNormalizedFunctionName,
      getRestApiLogicalId,
      getApiGatewayLogGroupLogicalId,
      generateApiGatewayDeploymentLogicalId,
      getStackName,
    },
  };
  const serverless = {
    instanceId: '1234',
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
    getProvider: sinon.stub().withArgs('aws').returns(provider),
    service: {
      provider: {
        stage: 'test',
        compiledCloudFormationTemplate: {
          Resources: {
            ApiGatewayRestApi: {
              name: 'abcd',
            },
          },
        },
        logs: {
          restApi: true,
        },
      },
      functions: {
        A: {
          name: 'a',
        },
      },
    },
  };

  const plugin = new Plugin(serverless);

  sinon.stub(plugin, 'getConfig').returns({
    enabled: true,
    destinationArn: 'arn:aws:lambda:blah-blah-blah',
    filterPattern: '{ $.level = 42 }',
    apiGatewayLogs: true,
    addLambdaPermission: true,
  });

  // Return true to emulate the CFN stack already existing
  sinon.stub(plugin, 'isDeployed').returns(true);
  sinon.stub(plugin, 'getLogGroupName').returns('/aws/lambda/a');

  await plugin.addLogSubscriptions();

  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  t.deepEqual(resources, {
    ALogLambdaPermission: {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: 'arn:aws:lambda:blah-blah-blah',
        Principal: 'logs.undefined.amazonaws.com',
        SourceArn: {
          'Fn::GetAtt': ['ALogGroup', 'Arn'],
        },
      },
    },
    ASubscriptionFilter: {
      Type: 'AWS::Logs::SubscriptionFilter',
      Properties: {
        DestinationArn: 'arn:aws:lambda:blah-blah-blah',
        FilterPattern: '{ $.level = 42 }',
        LogGroupName: '/aws/lambda/a',
      },
      DependsOn: ['ALogLambdaPermission', 'ALogGroup'],
    },
    ApiGatewayLogGroupLambdaPermission: {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: 'arn:aws:lambda:blah-blah-blah',
        Principal: 'logs.undefined.amazonaws.com',
        SourceArn: {
          'Fn::GetAtt': [getApiGatewayLogGroupLogicalId(), 'Arn'],
        },
      },
    },
    ApiGatewayExecutionLogGroupLambdaPermission: {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: 'arn:aws:lambda:blah-blah-blah',
        Principal: 'logs.undefined.amazonaws.com',
        SourceArn: {
          'Fn::Sub': `arn:aws:logs:\${AWS::Region}:\${AWS::AccountId}:log-group:API-Gateway-Execution-Logs_$\{${getRestApiLogicalId()}}/${
            serverless.service.provider.stage
          }:*`,
        },
      },
    },
    ApiGatewayAccessLogGroupSubscriptionFilter: {
      Type: 'AWS::Logs::SubscriptionFilter',
      Properties: {
        DestinationArn: 'arn:aws:lambda:blah-blah-blah',
        FilterPattern: '{ $.level = 42 }',
        LogGroupName: {
          Ref: getApiGatewayLogGroupLogicalId(),
        },
      },
      DependsOn: ['ApiGatewayLogGroupLambdaPermission'],
    },
    ApiGatewayExecutionLogGroupSubscriptionFilter: {
      Type: 'AWS::Logs::SubscriptionFilter',
      Properties: {
        DestinationArn: 'arn:aws:lambda:blah-blah-blah',
        FilterPattern: '{ $.level = 42 }',
        LogGroupName: {
          'Fn::Sub': `API-Gateway-Execution-Logs_$\{${getRestApiLogicalId()}}/${
            serverless.service.provider.stage
          }`,
        },
      },
      DependsOn: ['ApiGatewayDeployment1234'],
    },
    ApiGatewayRestApi: { name: 'abcd' },
  });
});

test("doesn't configure api gateway log subscriptions when provider.logs.restApi is false", async t => {
  const getNormalizedFunctionName = sinon.stub().onCall(0).returns('A').onCall(1).returns('B');
  const getRestApiLogicalId = sinon.stub().returns('abcd1234');
  const getApiGatewayLogGroupLogicalId = sinon.stub().returns('ApiGatewayLogGroup');
  const generateApiGatewayDeploymentLogicalId = sinon.stub().returns('ApiGatewayDeployment1234');
  const getStackName = sinon.stub().returns('testing-cfn-stack');

  const provider = {
    naming: {
      getNormalizedFunctionName,
      getRestApiLogicalId,
      generateApiGatewayDeploymentLogicalId,
      getApiGatewayLogGroupLogicalId,
      getStackName,
    },
  };
  const serverless = {
    instanceId: '1234',
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
    getProvider: sinon.stub().withArgs('aws').returns(provider),
    service: {
      provider: {
        stage: 'test',
        compiledCloudFormationTemplate: {
          Resources: {
            ApiGatewayRestApi: {
              name: 'abcd',
            },
          },
        },
        logs: {
          restApi: false, // don't enable API gateway logs
        },
      },
      functions: {
        A: {
          name: 'a',
        },
        B: {
          name: 'b',
        },
      },
    },
  };

  const plugin = new Plugin(serverless);

  sinon.stub(plugin, 'getConfig').returns({
    enabled: true,
    destinationArn: 'blah-blah-blah',
    filterPattern: '{ $.level = 42 }',
    filterName: 'a-custom-filter-name',
    apiGatewayLogs: true,
    addLambdaPermission: true,
  });

  sinon.stub(plugin, 'isDeployed').returns(false);
  sinon
    .stub(plugin, 'getLogGroupName')
    .onCall(0)
    .returns('/aws/lambda/a')
    .onCall(1)
    .returns('/aws/lambda/b');

  await plugin.addLogSubscriptions();

  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  // We are expecting an API gateway resource, and no ApiGateway log subscriptions/groups
  t.deepEqual(resources, {
    ApiGatewayRestApi: { name: 'abcd' },
    ASubscriptionFilter: {
      Type: 'AWS::Logs::SubscriptionFilter',
      Properties: {
        DestinationArn: 'blah-blah-blah',
        FilterPattern: '{ $.level = 42 }',
        LogGroupName: '/aws/lambda/a',
        FilterName: 'a-custom-filter-name',
      },
      DependsOn: ['ALogGroup'],
    },
    BSubscriptionFilter: {
      Type: 'AWS::Logs::SubscriptionFilter',
      Properties: {
        DestinationArn: 'blah-blah-blah',
        FilterPattern: '{ $.level = 42 }',
        LogGroupName: '/aws/lambda/b',
        FilterName: 'a-custom-filter-name',
      },
      DependsOn: ['BLogGroup'],
    },
  });
});

test("doesn't configure api gateway log subscriptions when enabled is false", async t => {
  const getStackName = sinon.stub().returns('testing-cfn-stack');

  const provider = {
    naming: {
      getStackName,
    },
  };
  const serverless = {
    instanceId: '1234',
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
    getProvider: sinon.stub().withArgs('aws').returns(provider),
    service: {
      provider: {
        stage: 'test',
        compiledCloudFormationTemplate: {
          Resources: {},
        },
        logs: {
          restApi: false, // don't enable API gateway logs
        },
      },
      functions: {},
    },
  };

  const plugin = new Plugin(serverless);

  sinon.stub(plugin, 'getConfig').returns({
    enabled: false,
    destinationArn: 'blah-blah-blah',
    filterPattern: '{ $.level = 42 }',
    apiGatewayLogs: true,
  });

  await plugin.addLogSubscriptions();

  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  t.deepEqual(resources, {});
});

test('configures subscriptions for an array-like config', async t => {
  const getNormalizedFunctionName = sinon.stub().returns('A');
  const getRestApiLogicalId = sinon.stub().returns('abcd1234');
  const getApiGatewayLogGroupLogicalId = sinon.stub().returns('ApiGatewayLogGroup');
  const generateApiGatewayDeploymentLogicalId = sinon.stub().returns('ApiGatewayDeployment1234');
  const getStackName = sinon.stub().returns('testing-cfn-stack');

  const provider = {
    naming: {
      getNormalizedFunctionName,
      getRestApiLogicalId,
      getApiGatewayLogGroupLogicalId,
      generateApiGatewayDeploymentLogicalId,
      getStackName,
    },
  };
  const config = {
    enabled: true,
    destinationArn: 'arn:aws:lambda:blah-blah-blah',
    filterPattern: '{ $.level = 42 }',
    apiGatewayLogs: true,
    addLambdaPermission: true,
  };
  const serverless = {
    instanceId: '1234',
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
    getProvider: sinon.stub().withArgs('aws').returns(provider),
    service: {
      provider: {
        stage: 'test',
        compiledCloudFormationTemplate: {
          Resources: {
            ApiGatewayRestApi: {
              name: 'abcd',
            },
          },
        },
        logs: {
          restApi: true,
        },
      },
      custom: {
        logSubscription: [
          config
        ]
      },
      functions: {
        A: {
          name: 'a',
        },
      },
    },
  };

  const plugin = new Plugin(serverless);

  sinon.stub(plugin, 'getConfig').returns(config);

  // Return true to emulate the CFN stack already existing
  sinon.stub(plugin, 'isDeployed').returns(true);
  sinon.stub(plugin, 'getLogGroupName').returns('/aws/lambda/a');

  await plugin.addLogSubscriptions();

  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  t.deepEqual(resources, {
    ALogLambdaPermission: {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: 'arn:aws:lambda:blah-blah-blah',
        Principal: 'logs.undefined.amazonaws.com',
        SourceArn: {
          'Fn::GetAtt': ['ALogGroup', 'Arn'],
        },
      },
    },
    ASubscriptionFilter0: {
      Type: 'AWS::Logs::SubscriptionFilter',
      Properties: {
        DestinationArn: 'arn:aws:lambda:blah-blah-blah',
        FilterPattern: '{ $.level = 42 }',
        LogGroupName: '/aws/lambda/a',
      },
      DependsOn: ['ALogLambdaPermission', 'ALogGroup'],
    },
    ApiGatewayLogGroupLambdaPermission0: {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: 'arn:aws:lambda:blah-blah-blah',
        Principal: 'logs.undefined.amazonaws.com',
        SourceArn: {
          'Fn::GetAtt': [getApiGatewayLogGroupLogicalId(), 'Arn'],
        },
      },
    },
    ApiGatewayExecutionLogGroupLambdaPermission0: {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: 'arn:aws:lambda:blah-blah-blah',
        Principal: 'logs.undefined.amazonaws.com',
        SourceArn: {
          'Fn::Sub': `arn:aws:logs:\${AWS::Region}:\${AWS::AccountId}:log-group:API-Gateway-Execution-Logs_$\{${getRestApiLogicalId()}}/${
            serverless.service.provider.stage
          }:*`,
        },
      },
    },
    ApiGatewayAccessLogGroupSubscriptionFilter0: {
      Type: 'AWS::Logs::SubscriptionFilter',
      Properties: {
        DestinationArn: 'arn:aws:lambda:blah-blah-blah',
        FilterPattern: '{ $.level = 42 }',
        LogGroupName: {
          Ref: getApiGatewayLogGroupLogicalId(),
        },
      },
      DependsOn: ['ApiGatewayLogGroupLambdaPermission0'],
    },
    ApiGatewayExecutionLogGroupSubscriptionFilter0: {
      Type: 'AWS::Logs::SubscriptionFilter',
      Properties: {
        DestinationArn: 'arn:aws:lambda:blah-blah-blah',
        FilterPattern: '{ $.level = 42 }',
        LogGroupName: {
          'Fn::Sub': `API-Gateway-Execution-Logs_$\{${getRestApiLogicalId()}}/${
            serverless.service.provider.stage
          }`,
        },
      },
      DependsOn: ['ApiGatewayDeployment1234'],
    },
    ApiGatewayRestApi: { name: 'abcd' },
  });
});

test('configures api gateway log subscriptions for execution logs only when accessLogging is false', async t => {
  const getNormalizedFunctionName = sinon.stub().returns('A');
  const getRestApiLogicalId = sinon.stub().returns('abcd1234');
  const getApiGatewayLogGroupLogicalId = sinon.stub().returns('ApiGatewayLogGroup');
  const generateApiGatewayDeploymentLogicalId = sinon.stub().returns('ApiGatewayDeployment1234');
  const getStackName = sinon.stub().returns('testing-cfn-stack');

  const provider = {
    naming: {
      getNormalizedFunctionName,
      getRestApiLogicalId,
      getApiGatewayLogGroupLogicalId,
      generateApiGatewayDeploymentLogicalId,
      getStackName,
    },
  };
  const serverless = {
    instanceId: '1234',
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
    getProvider: sinon.stub().withArgs('aws').returns(provider),
    service: {
      provider: {
        stage: 'test',
        compiledCloudFormationTemplate: {
          Resources: {
            ApiGatewayRestApi: {
              name: 'abcd',
            },
          },
        },
        logs: {
          restApi: {
            accessLogging: false
          },
        },
      },
      functions: {
        A: {
          name: 'a',
        },
      },
    },
  };

  const plugin = new Plugin(serverless);

  sinon.stub(plugin, 'getConfig').returns({
    enabled: true,
    destinationArn: 'arn:aws:lambda:blah-blah-blah',
    filterPattern: '{ $.level = 42 }',
    apiGatewayLogs: true,
    addLambdaPermission: true,
  });

  // Return true to emulate the CFN stack already existing
  sinon.stub(plugin, 'isDeployed').returns(true);
  sinon.stub(plugin, 'getLogGroupName').returns('/aws/lambda/a');

  await plugin.addLogSubscriptions();

  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  t.is(resources.ApiGatewayLogGroupLambdaPermission, undefined);
  t.is(resources.ApiGatewayAccessLogGroupSubscriptionFilter, undefined);
  t.not(resources.ApiGatewayExecutionLogGroupLambdaPermission, undefined);
  t.not(resources.ApiGatewayExecutionLogGroupSubscriptionFilter, undefined);
});

test('configures api gateway log subscriptions for access logs only when executionLogging is false', async t => {
  const getNormalizedFunctionName = sinon.stub().returns('A');
  const getRestApiLogicalId = sinon.stub().returns('abcd1234');
  const getApiGatewayLogGroupLogicalId = sinon.stub().returns('ApiGatewayLogGroup');
  const generateApiGatewayDeploymentLogicalId = sinon.stub().returns('ApiGatewayDeployment1234');
  const getStackName = sinon.stub().returns('testing-cfn-stack');

  const provider = {
    naming: {
      getNormalizedFunctionName,
      getRestApiLogicalId,
      getApiGatewayLogGroupLogicalId,
      generateApiGatewayDeploymentLogicalId,
      getStackName,
    },
  };
  const serverless = {
    instanceId: '1234',
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
    getProvider: sinon.stub().withArgs('aws').returns(provider),
    service: {
      provider: {
        stage: 'test',
        compiledCloudFormationTemplate: {
          Resources: {
            ApiGatewayRestApi: {
              name: 'abcd',
            },
          },
        },
        logs: {
          restApi: {
            executionLogging: false
          },
        },
      },
      functions: {
        A: {
          name: 'a',
        },
      },
    },
  };

  const plugin = new Plugin(serverless);

  sinon.stub(plugin, 'getConfig').returns({
    enabled: true,
    destinationArn: 'arn:aws:lambda:blah-blah-blah',
    filterPattern: '{ $.level = 42 }',
    apiGatewayLogs: true,
    addLambdaPermission: true,
  });

  // Return true to emulate the CFN stack already existing
  sinon.stub(plugin, 'isDeployed').returns(true);
  sinon.stub(plugin, 'getLogGroupName').returns('/aws/lambda/a');

  await plugin.addLogSubscriptions();

  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  t.not(resources.ApiGatewayLogGroupLambdaPermission, undefined);
  t.not(resources.ApiGatewayAccessLogGroupSubscriptionFilter, undefined);
  t.is(resources.ApiGatewayExecutionLogGroupLambdaPermission, undefined);
  t.is(resources.ApiGatewayExecutionLogGroupSubscriptionFilter, undefined);
});
