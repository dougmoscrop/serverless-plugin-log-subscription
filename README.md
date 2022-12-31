# serverless-plugin-log-subscription

This plugin adds an `AWS::Logs::LogSubscription` for each of your Lambda functions when enabled.

Log subscriptions are used to deliver your CloudWatch Logs to a destination of some kind. This may be a CloudWatch Destination resource (which wraps a Kinesis stream) or a Lambda function.

## Changes In 2.0

As of 2.0, this plugin will automatically create the `AWS::Lambda::Permission` if your destinationArn is a reference to a Lambda function within your service.

If you do not want permissions to be created automatically, you can set `addLambdaPermission: false`.

The addSourceLambdaPermission option has been removed and will throw an error.

## Configuration

Configuration happens both 'globally' (via custom.logSubscription) and also at the function level (via function.yourFunction.logSubscription)

`enabled` - whether or not log subscriptions are enabled. defaults to false globally, if set to true it will be on for all functions (unless they set to false)

`destinationArn` (required) - the arn of the CloudWatch Destination (you create this resource yourself) or an Fn::GetAtt reference to a local Lambda function for direct subscription

`roleArn` (optional) - the arn of the IAM role granting logs permission to put to Destination (you create this resource yourself)

`filterPattern` (optional) if specified, it will only forward logs matching this pattern. You can do simple token matching, or JSON matching (e.g. `{ $.level >= 30 }` to match a bunyan level)

`filterName` (optional) if specified, this name will be used for the FilterName property of the AWS Subscription Filter.

`apiGatewayLogs` (optional) if `true` the plugin will configure a subscription filter for the API Gateway access and execution log groups. This feature only works if logging is enabled for the API gateway as well.

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
    filterName: 'some-filter-name'

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

Lambda function directly:

```yml
custom:
  logSubscription:
    enabled: true
    destinationArn:
      # Note that you have to use Serverless' naming convention here
      Fn::GetAtt: ['LogsProcessorLambdaFunction', 'Arn']
    addLambdaPermission: true # this is the default, set to false to manage your own permissions

functions:
  api:
    ...
  logsProcessor:
    logSubscription: false # Don't subscribe the log processors logs to the log processor..
```

Several subscription filters for one log group / the same log group:

Note: Please make sure your AWS account is allowed to use this feature!   
By default, AWS allows to use 1 subscription filter per log group and this quota can't be changed.   
But, there is an opportunity to ask AWS Support to help you with using several subscription filters for 
one log group.

```yml
custom:
  logSubscription:
    - enabled: true
      destinationArn: 'some-arn-1'
      roleArn: 'some-arn'
    - enabled: true
      destinationArn: 'some-arn-2'
      roleArn: 'some-arn'

functions:
  myFunction:
    ...
```
