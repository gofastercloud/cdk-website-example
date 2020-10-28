#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { WebsiteStack } from '../lib/website-stack';
import { CertificateStack } from '../lib/certificate-stack';
import { LambdaEdgeStack } from '../lib/lambdaedge-stack';
import { Tags } from '@aws-cdk/core';

const envEUW1 = {
	account: '581911119805',
	region: 'eu-west-1',
};

const envUSE1 = {
	account: '581911119805',
	region: 'us-east-1',
};

const app = new cdk.App();
const domain: string = app.node.tryGetContext('domain_name');

const web = new WebsiteStack(app, 'WebsiteStack', { env: envEUW1 });
const cert = new CertificateStack(app, 'CertificateStack', { env: envUSE1 });
const lambdaEdge = new LambdaEdgeStack(app, 'LambdaEdgeStack', {
	env: envUSE1,
});

Tags.of(web).add('StackType', 'WebSite');
Tags.of(web).add('DomainName', domain);

Tags.of(cert).add('StackType', 'Certificate');
Tags.of(cert).add('DomainName', domain);

Tags.of(lambdaEdge).add('StackType', 'Lambda@Edge');
Tags.of(lambdaEdge).add('DomainName', domain);
