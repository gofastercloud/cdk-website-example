#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { WebsiteStack } from '../lib/website-stack';
import { CertificateStack } from '../lib/certificate-stack';
import { LambdaEdgeStack } from '../lib/lambdaedge-stack';

const envEUW1 = {
	account: '581911119805',
	region: 'eu-west-1',
};

const envUSE1 = {
	account: '581911119805',
	region: 'us-east-1',
};

const app = new cdk.App();
new WebsiteStack(app, 'WebsiteStack', { env: envEUW1 });
new CertificateStack(app, 'CertificateStack', { env: envUSE1 });
new LambdaEdgeStack(app, 'LambdaEdgeStack', { env: envUSE1 });
