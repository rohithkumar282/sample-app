import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';

export class AwsInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const wsHandler = new lambda.Function(this, 'WebSocketHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
      },
    });
    connectionsTable.grantReadWriteData(wsHandler);

    const wsApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      connectRouteOptions: { integration: new integrations.WebSocketLambdaIntegration('ConnectIntegration', wsHandler) },
      disconnectRouteOptions: { integration: new integrations.WebSocketLambdaIntegration('DisconnectIntegration', wsHandler) },
      defaultRouteOptions: { integration: new integrations.WebSocketLambdaIntegration('DefaultIntegration', wsHandler) },
    });

    const wsStage = new apigatewayv2.WebSocketStage(this, 'DevStage', {
      webSocketApi: wsApi,
      stageName: 'dev',
      autoDeploy: true,
    });

    wsHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${wsApi.apiId}/${wsStage.stageName}/POST/@connections/*`]
    }));

    new cdk.CfnOutput(this, 'WebSocketUrl', { value: `${wsApi.apiEndpoint}/${wsStage.stageName}`});

    const websiteBucket = new s3.Bucket(this, "reactbucket-s3-webpage", {
      versioned: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    })

    const originaccessidentity = new cloudfront.OriginAccessIdentity(this, 'WebsiteOAI', {
      comment: 'OAI for CloudFront to access private S3 bucket',
    });

    websiteBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [websiteBucket.arnForObjects('*')],
      principals: [
        new iam.CanonicalUserPrincipal(originaccessidentity.cloudFrontOriginAccessIdentityS3CanonicalUserId),
      ],
    }));
    
    const distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.minutes(0) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.minutes(0) },
      ]
    });

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: distribution.domainName,
      description: 'Use this URL to access the website via CloudFront',
    });

    // new cdk.CfnOutput(this, 'S3WebsiteEndpoint', {
    //   value: websiteBucket.bucketWebsiteUrl,
    //   description: 'S3 website URL',
    // });

    const outputSource = new codepipeline.Artifact();
    const outputWebsite = new codepipeline.Artifact();

    const pipeline = new codepipeline.Pipeline(this, "Pipeline", {
      pipelineName: "react-pipeline",
      restartExecutionOnUpdate: true,
    })

    pipeline.addStage({
      stageName: "Source",
      actions:[
        new codepipeline_actions.CodeStarConnectionsSourceAction({
          actionName: "GithubSource",
          owner: "rohithkumar282",
          repo: "sample-app",
          branch: "main",
          output: outputSource,
          connectionArn: "arn:aws:codeconnections:us-east-1:004657931788:connection/8f72ed72-706c-4f22-93a2-3cc939545598"
        })

      ]
    })

    pipeline.addStage({
      stageName: "Build",
      actions:[
        new codepipeline_actions.CodeBuildAction({
          actionName: "BuildUI",
          project: new codebuild.PipelineProject(this, "UIBuild", {
            environment: {
              buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
              privileged: true,
              computeType: codebuild.ComputeType.SMALL
            },
            environmentVariables: {
              REACT_APP_WEBSOCKET_URL: {
                value: `${wsApi.apiEndpoint}/${wsStage.stageName}`,
              },
            },
            projectName: "reactWebsite",
            buildSpec: codebuild.BuildSpec.fromSourceFilename("./buildspec.yml"),
          }),
          input: outputSource,
          outputs: [outputWebsite]
        })
      ]
    })

    pipeline.addStage({
      stageName: "Deploy",
      actions:[
        new codepipeline_actions.S3DeployAction({
          actionName: "Deployingreactwebsite",
          input: outputWebsite, 
          bucket: websiteBucket
        })
        
      ]
    })

  }
}