'use strict';

const test = require('ava');
const { mockClient } = require('aws-sdk-client-mock');
const { CloudFormationClient, DescribeStacksCommand } = require('@aws-sdk/client-cloudformation');

const Plugin = require('..');

test('returns true if stack already exists', async (t) => {
  const serverless = {
    service: {},
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
  };

  const cfnMock = mockClient(CloudFormationClient);
  cfnMock.on(DescribeStacksCommand).resolves({
    Stacks: [
      {
        StackName: 'testing-cfn-stack',
      },
    ],
  });

  const plugin = new Plugin(serverless);

  const result = await plugin.isDeployed('testing-cfn-stack');

  t.true(result);
});

test('returns false if no existing stack is found', async (t) => {
  const serverless = {
    service: {},
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
  };

  const cfnMock = mockClient(CloudFormationClient);
  cfnMock.on(DescribeStacksCommand).rejects('stack with id testing-cfn-stack does not exist');

  const plugin = new Plugin(serverless);

  const result = await plugin.isDeployed('testing-cfn-stack');

  t.false(result);
});

test('throws error for any other aws-sdk exception', async (t) => {
  const serverless = {
    service: {},
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
  };

  const cfnMock = mockClient(CloudFormationClient);
  cfnMock.on(DescribeStacksCommand).rejects('some other error');

  const plugin = new Plugin(serverless);

  const error = await t.throwsAsync(plugin.isDeployed());
  t.is(error.message, 'some other error');
});
