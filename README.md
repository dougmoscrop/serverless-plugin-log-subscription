# serverless-plugin-log-subscription

This plugin adds an `AWS::Logs::LogSubscription` for each of your Lambda functions when enabled.

Log subscriptions are used to deliver your CloudWatch Logs to a destination of some kind. This may be a CloudWatch Destination resource (which wraps a Kinesis stream) or a Lambda function.

## Changes In 2.0

As of 2.0, this plugin will automatically create the `AWS::Lambda::Permission` if your destinationArn is a reference to a Lambda function within your service.

If you do not want permissions to be created automatically, you can set `addLambdaPermission: false`.

The addSourceLambdaPermission option has been removed and will throw an error.

## Configuration

Configuration happens both 'globally' (via custom.logSubscription) and also at the function level (via function.yourFunction.logSubscription)

| Name             | Description                                                                                                                                                         | Type    | Default                                                               | Required |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------- | :------: |
| `enabled`        | whether or not log subscriptions are enabled. defaults to false globally, if set to true it will be on for all functions (unless they set to false)                 | Boolean | `false`                                                               |   true   |
| `destinationArn` | the arn of the CloudWatch Destination (you create this resource yourself) or an Fn::GetAtt reference to a local Lambda function for direct subscription             | String  | `""`                                                                  |   true   |
| `roleArn`        | the arn of the IAM role granting logs permission to put to Destination (you create this resource yourself)                                                          | String  | `""`                                                                  |  false   |
| `filterPattern`  | if specified, it will only forward logs matching this pattern. You can do simple token matching, or JSON matching (e.g. `{ $.level >= 30 }` to match a bunyan level | String  | `""`                                                                  |  false   |
| `apiGatewayLogs` | Configures a subscription filter for the API Gateway access and execution log groups.                                                                               | Object  | <pre>apiGatewayLogs:<br> access: false<br> execution: false<br></pre> |  false   |

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
  myFunction: ...
```

Disabled for one function:

```yml
custom:
  logSubscription:
    enabled: true
    destinationArn: 'some-arn'

functions:
  myFunction: ...
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
      Fn::GetAtt: ['LogsProcessorLambdaFunction', 'arn']
    addLambdaPermission: true # this is the default, set to false to manage your own permissions

functions:
  api: ...
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
  myFunction: ...
```
