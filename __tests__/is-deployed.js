'use strict';

const test = require('ava');
const sinon = require('sinon');
const configureAwsRequestStub = require('@serverless/test/configure-aws-request-stub');

const Plugin = require('..');

test('returns true if stack already exists', async t => {
  const provider = {
    request: () => true,
  };

  const serverless = {
    service: {
      provider: {
        name: 'aws',
      },
    },
    getProvider: sinon.stub().returns(provider),
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
  };

  configureAwsRequestStub(serverless.getProvider('aws'), {
    CloudFormation: {
      describeStacks: {
        Stacks: [
          {
            StackId: 'blah',
          },
        ],
      },
    },
  });

  const plugin = new Plugin(serverless);

  const result = await plugin.isDeployed('testing-cfn-stack');

  t.true(result);
});

test('returns false if no existing stack is found', async t => {
  const provider = {
    request: () => true,
  };

  const serverless = {
    service: {
      provider: {
        name: 'aws',
      },
    },
    getProvider: sinon.stub().returns(provider),
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
  };

  configureAwsRequestStub(serverless.getProvider('aws'), {
    CloudFormation: {
      describeStacks: {
        Stacks: [],
      },
    },
  });

  const plugin = new Plugin(serverless);

  const result = await plugin.isDeployed('testing-cfn-stack');

  t.false(result);
});

test('throws error for any other aws-sdk exception', async t => {
  const provider = {
    request: () => true,
  };

  const serverless = {
    service: {},
    getProvider: sinon.stub().returns(provider),
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
  };

  configureAwsRequestStub(serverless.getProvider('aws'), {
    CloudFormation: {
      describeStacks: () => {
        throw new Error('some other error');
      },
    },
  });

  const plugin = new Plugin(serverless);

  const error = await t.throwsAsync(plugin.isDeployed('testing-cfn-stack'));
  t.is(error.message, 'some other error');
});
