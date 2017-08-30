'use strict';

const sinon = require('sinon');
const test = require('ava');

const Plugin = require('..');

test('does nothing when there are no functions', t => {
  const serverless = {
    service: {},
  };

  const plugin = new Plugin(serverless);

  plugin.addLogSubscriptions();

  t.pass();
});

test('adds subscriptions for enabled functions', t => {
  const getNormalizedFunctionName = sinon.stub()
    .onCall(0).returns('A')
    .onCall(1).returns('B');

  const provider = {
    naming: {
      getNormalizedFunctionName
    }
  };
  const serverless = {
    getProvider: sinon.stub().withArgs('aws').returns(provider),
    service: {
      provider: {
        compiledCloudFormationTemplate: {}
      },
      functions: {
        A: {},
        B: {},
        C: {}
      }
    }
  };

  const plugin = new Plugin(serverless);

  sinon.stub(plugin, 'getConfig')
    .onCall(0).returns({ enabled: true })
    .onCall(1).returns({ enabled: true })
    .onCall(2).returns({ enabled: false })

  plugin.addLogSubscriptions();

  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  t.deepEqual(Object.keys(resources), ['ASubscriptionFilter', 'BSubscriptionFilter']);
  t.deepEqual(resources.ASubscriptionFilter.Type, 'AWS::Logs::SubscriptionFilter');
  t.deepEqual(resources.BSubscriptionFilter.Type, 'AWS::Logs::SubscriptionFilter');
});

test('configures the subscription filter correctly', t => {
  const getNormalizedFunctionName = sinon.stub().returns('A');

  const provider = {
    naming: {
      getNormalizedFunctionName
    }
  };
  const serverless = {
    getProvider: sinon.stub().withArgs('aws').returns(provider),
    service: {
      provider: {
        compiledCloudFormationTemplate: {}
      },
      functions: {
        A: {
          name: 'a'
        }
      }
    }
  };

  const plugin = new Plugin(serverless);

  sinon.stub(plugin, 'getConfig').returns({
      enabled: true,
      destinationArn: 'blah-blah-blah',
      filterPattern: '{ $.level = 42 }',
      logGroupName: '/aws/lambda/a'
    });

  plugin.addLogSubscriptions();

  const resources = serverless.service.provider.compiledCloudFormationTemplate.Resources;

  t.deepEqual(resources.ASubscriptionFilter.Properties, {
    DestinationArn: 'blah-blah-blah',
    FilterPattern: '{ $.level = 42 }',
    LogGroupName: '/aws/lambda/a'
  });
});
