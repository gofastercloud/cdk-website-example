#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { WebsiteStack } from '../lib/website-stack';
import { CertificateStack } from '../lib/certificate-stack';

const envWebsite = {
	account: '581911119805',
	region: 'eu-west-1',
};

const envCertificate = {
	account: '581911119805',
	region: 'us-east-1',
};

const app = new cdk.App();
new WebsiteStack(app, 'WebsiteStack', { env: envWebsite });
new CertificateStack(app, 'CertificateStack', { env: envCertificate });
