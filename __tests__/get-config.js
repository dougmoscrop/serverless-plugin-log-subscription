'use strict';

const sinon = require('sinon');
const test = require('ava');

const Plugin = require('..');

test('defaults to disabled', t => {
  const serverless = {
    service: {}
  };

  const plugin = new Plugin(serverless);

  const config = plugin.getConfig(null, {});

  t.false(config.enabled);
});

test('enabled by function (true)', t => {
  const serverless = {
    service: {}
  };

  const plugin = new Plugin(serverless);

  const config = plugin.getConfig(null, { name: 'a', logSubscription: true });

  t.deepEqual(config, { enabled: true, filterPattern: '', logGroupName: '/aws/lambda/a' });
});

test('enabled by function (object)', t => {
  const serverless = {
    service: {}
  };

  const plugin = new Plugin(serverless);

  const config = plugin.getConfig(null, { logSubscription: {} });

  t.true(config.enabled);
});

test('disabled by function (false)', t => {
  const serverless = {
    service: {}
  };

  const plugin = new Plugin(serverless);

  const config = plugin.getConfig(null, { logSubscription: false });

  t.false(config.enabled);
});

test('disabled by function (object)', t => {
  const serverless = {
    service: {}
  };

  const plugin = new Plugin(serverless);

  const config = plugin.getConfig(null, { logSubscription: { enabled: false } });

  t.false(config.enabled);
});

test('enabled (globally)', t => {
  const serverless = {
    service: {}
  };

  const plugin = new Plugin(serverless);

  const config = plugin.getConfig({ enabled: true }, {});

  t.true(config.enabled);
});

test('disabled (function overrides globally)', t => {
  const serverless = {
    service: {}
  };

  const plugin = new Plugin(serverless);

  const config = plugin.getConfig({ enabled: true }, { logSubscription: { enabled: false } });

  t.false(config.enabled);
});

test('global config', t => {
  const serverless = {
    service: {}
  };

  const plugin = new Plugin(serverless);

  const config = plugin.getConfig({ destinationArn: 'foo', filterPattern: 'abc' }, { logSubscription: {} });

  t.deepEqual(config.destinationArn, 'foo');
  t.deepEqual(config.filterPattern, 'abc');
});

test('function override', t => {
  const serverless = {
    service: {}
  };

  const plugin = new Plugin(serverless);

  const config = plugin.getConfig({ destinationArn: 'foo', filterPattern: 'abc' }, {
    logSubscription: {
      destinationArn: 'bar',
      filterPattern: 'qqq'
    }
  });

  t.deepEqual(config.destinationArn, 'bar');
  t.deepEqual(config.filterPattern, 'qqq');
});
