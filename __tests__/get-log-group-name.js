'use strict';

const test = require('ava');
const sinon = require('sinon');

const Plugin = require('..');

test('throws when resource is missing', t => {
  const serverless = {
    service: {},
    getProvider: sinon.stub().withArgs('aws').returns({}),
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
  };

  const plugin = new Plugin(serverless);

  const e = t.throws(() => plugin.getLogGroupName({ Resources: {} }, 'AFunctionLogGroup'));

  t.deepEqual(e.message, 'Could not find log group resource AFunctionLogGroup');
});

test('throws when resource is wrong type', t => {
  const serverless = {
    service: {},
    getProvider: sinon.stub().withArgs('aws').returns({}),
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
  };

  const plugin = new Plugin(serverless);

  const e = t.throws(() =>
    plugin.getLogGroupName(
      {
        Resources: {
          AFunctionLogGroup: {
            Type: 'SomethingWrong',
          },
        },
      },
      'AFunctionLogGroup'
    )
  );

  t.deepEqual(
    e.message,
    'Expected AFunctionLogGroup to have a Type of AWS::Logs::LogGroup but got SomethingWrong'
  );
});

test('throws when resource is missing Properties', t => {
  const serverless = {
    service: {},
    getProvider: sinon.stub().withArgs('aws').returns({}),
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
  };

  const plugin = new Plugin(serverless);

  const e = t.throws(() =>
    plugin.getLogGroupName(
      {
        Resources: {
          AFunctionLogGroup: {
            Type: 'AWS::Logs::LogGroup',
            Properties: {},
          },
        },
      },
      'AFunctionLogGroup'
    )
  );

  t.deepEqual(e.message, 'AFunctionLogGroup did not have Properties.LogGroupName');
});

test('throws when resource is missing Properties.LogGroupName', t => {
  const serverless = {
    service: {},
    getProvider: sinon.stub().withArgs('aws').returns({}),
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
  };

  const plugin = new Plugin(serverless);

  const e = t.throws(() =>
    plugin.getLogGroupName(
      {
        Resources: {
          AFunctionLogGroup: {
            Type: 'AWS::Logs::LogGroup',
          },
        },
      },
      'AFunctionLogGroup'
    )
  );

  t.deepEqual(e.message, 'AFunctionLogGroup did not have Properties.LogGroupName');
});

test('returns LogGroupName', t => {
  const serverless = {
    service: {},
    getProvider: sinon.stub().withArgs('aws').returns({}),
    configSchemaHandler: {
      defineFunctionProperties: Function.prototype,
    },
  };

  const plugin = new Plugin(serverless);

  const logGroupName = plugin.getLogGroupName(
    {
      Resources: {
        AFunctionLogGroup: {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: '/aws/lambda/a',
          },
        },
      },
    },
    'AFunctionLogGroup'
  );

  t.deepEqual(logGroupName, '/aws/lambda/a');
});
