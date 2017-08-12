'use strict';

const test = require('ava');
const sinon = require('sinon');

const Plugin = require('..');

test('adds the right hooks', t => {
  const plugin = new Plugin();

  t.true(typeof plugin.hooks['aws:package:finalize:mergeCustomProviderResources'] === 'function');
});

test('hook calls the method', t => {
  const plugin = new Plugin();

  const stub = sinon.stub(plugin, 'addLogSubscriptions');

  plugin.hooks['aws:package:finalize:mergeCustomProviderResources']();

  t.true(stub.calledOnce);
});
