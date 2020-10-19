#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { WebsiteStack } from '../lib/website-stack';

const app = new cdk.App();
new WebsiteStack(app, 'WebsiteStack');
