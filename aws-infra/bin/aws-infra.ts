#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AwsInfraStack } from '../lib/aws-infra-stack';

const app = new cdk.App();
new AwsInfraStack(app, 'AwsInfraStack', {
});