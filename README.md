# serverless-plugin-log-subscription

This plugin adds an `AWS::Logs::LogSubscription` for each of your Lambda functions when enabled.

Log subscriptions are used to deliver your CloudWatch Logs to a Kinesis stream for futher processing - such as indexing them in a Elasticsearch for 'centralized logging';

## Configuration

Configuration happens both 'globally' (via custom.logSubscription) and also at the function level (via function.yourFunction.logSubscription)

`enabled` - whether or not log subscriptions are enabled. defaults to false globally, if set to true it will be on for all functions (unless they set to false)

`destinationArn` (required) - the arn of the CloudWatch Destination (you create this resource yourself)

`roleArn` (optional) - the arn of the IAM role granting logs permission to put to Destination (you create this resource yourself)

`filterPattern` (optional) if specified, it will only forward logs matching this pattern. You can do simple token matching, or JSON matching (e.g. `{ $.level >= 30 }` to match a bunyan level)

### Examples

The most basic:

```yml
custom:
  logSubscription:
    destinationArn: 'some-arn'
    roleArn: 'some-arn'

functions:
  myFunction:
    logSubscription: true
```

Custom function settings:

```yml
custom:
  logSubscription:
    destinationArn: 'some-arn'

functions:
  myFunction:
    logSubscription:
      filterPattern: 'WARN*'
```

Enabled for all functions:

```yml
custom:
  logSubscription:
    enabled: true
    destinationArn: 'some-arn'
    roleArn: 'some-arn'

functions:
  myFunction:
    ...
```

Disabled for one function:

```yml
custom:
  logSubscription:
    enabled: true
    destinationArn: 'some-arn'

functions:
  myFunction:
    ...
  myOtherFunction:
    logSubscription: false
```
