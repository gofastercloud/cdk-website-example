import * as cdk from '@aws-cdk/core';
import * as route53 from '@aws-cdk/aws-route53';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as ssm from '@aws-cdk/aws-ssm';
import { IHostedZone } from '@aws-cdk/aws-route53';
import { Certificate } from '@aws-cdk/aws-certificatemanager';

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
		const websiteSSLCert: Certificate = new acm.Certificate(
			this,
			'WebsiteSSLCertificate',
			{
				domainName: apex,
				validation: acm.CertificateValidation.fromDns(hostedZone),
				subjectAlternativeNames: subjectAlternateNames,
			}
		);

		const websiteUserPoolDomain: Certificate = new acm.Certificate(
			this,
			'CognitoUserPoolDomainCert',
			{
				domainName: 'auth.' + apex,
				validation: acm.CertificateValidation.fromDns(hostedZone),
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
	}
}
