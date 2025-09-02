import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda_proc from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';

export class AwsInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const websiteBucket = new s3.Bucket(this, "reactbucket-s3-webpage", {
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "error.html",
      versioned: true,
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    })

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
          repo: "test-repo",
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
              buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
              privileged: true,
              computeType: codebuild.ComputeType.SMALL
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


