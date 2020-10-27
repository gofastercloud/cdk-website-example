import * as cdk from '@aws-cdk/core';
import * as route53 from '@aws-cdk/aws-route53';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as ssm from '@aws-cdk/aws-ssm';
import { IHostedZone } from '@aws-cdk/aws-route53';
import { DnsValidatedCertificate } from '@aws-cdk/aws-certificatemanager';

export class CertificateStack extends cdk.Stack {
	constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		// Get our Apex Domain from context
		const apex: string = this.node.tryGetContext('domain_name');
		const san: string = this.node.tryGetContext('san_domain_names');

		// Import Route53 Hosted Zone details using domain_name from CDK context
		const hostedZone: IHostedZone = route53.HostedZone.fromLookup(
			this,
			'HostedZone',
			{
				domainName: apex,
			}
		);

		// Get Subject Alternate Names for our ACM SSL Cert
		const subjectAlternateNames: string[] = san
			.split(',')
			.map(function (hostname: String) {
				return hostname + '.' + apex;
			});

		// Create ACM Certificate for the Apex plus our list of SAN hostnames
		const websiteSSLCert: DnsValidatedCertificate = new acm.DnsValidatedCertificate(
			this,
			'WebsiteSSLCertificate',
			{
				domainName: apex,
				hostedZone: hostedZone,
				subjectAlternativeNames: subjectAlternateNames,
			}
		);

		const websiteUserPoolDomain = new acm.DnsValidatedCertificate(
			this,
			'CognitoUserPoolDomainCert',
			{
				hostedZone: hostedZone,
				domainName: 'auth.' + apex,
			}
		);

		// Write out the ARN of the Certificate to SSM
		new ssm.StringParameter(this, 'WebsiteSSLCertificateARN', {
			description: 'ARN for our SSL Certificate for ' + apex,
			parameterName: apex + '-SSLCertificate',
			stringValue: websiteSSLCert.certificateArn,
		});

		// Write out the ARN of the Certificate to SSM
		new ssm.StringParameter(this, 'CognitoSSLCertificateARN', {
			description: 'ARN for our SSL Certificate for Cognito',
			parameterName: 'CognitoCertArn',
			stringValue: websiteUserPoolDomain.certificateArn,
		});

		new cdk.CfnOutput(this, 'WebsiteSSLCertificateOutput', {
			exportName: 'SSLCertificateArn',
			value: websiteSSLCert.certificateArn,
		});
	}
}
