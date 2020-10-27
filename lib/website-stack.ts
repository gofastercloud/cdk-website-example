import * as cdk from '@aws-cdk/core';
import * as route53 from '@aws-cdk/aws-route53';
import * as route53_targets from '@aws-cdk/aws-route53-targets';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as lambda from '@aws-cdk/aws-lambda';
import { BlockPublicAccess, Bucket, BucketEncryption } from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import {
	CloudFrontWebDistribution,
	CloudFrontWebDistributionProps,
	LambdaEdgeEventType,
	OriginAccessIdentity,
	SecurityPolicyProtocol,
	ViewerCertificate,
	ViewerProtocolPolicy,
} from '@aws-cdk/aws-cloudfront';
import { IHostedZone } from '@aws-cdk/aws-route53';
import * as cr from '@aws-cdk/custom-resources';
import { UserPool } from '@aws-cdk/aws-cognito';
import * as apigw from '@aws-cdk/aws-apigateway';
import * as path from 'path';

export class WebsiteStack extends cdk.Stack {
	constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		// Get our Apex Domain and alternate hostnames from context
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

		// Create S3 bucket which will hold static assets for our website
		const staticAssetBucket: Bucket = new Bucket(this, 'WebsiteStaticAssets', {
			encryption: BucketEncryption.S3_MANAGED,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			websiteIndexDocument: 'index.html',
		});

		const logBucket: Bucket = new Bucket(this, 'LogBucket', {
			encryption: BucketEncryption.S3_MANAGED,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
		});

		// Upload content for our site
		new s3deploy.BucketDeployment(this, 'DeployWebAssets', {
			sources: [s3deploy.Source.asset('./site_assets')],
			destinationBucket: staticAssetBucket,
			destinationKeyPrefix: 'www/static',
		});

		// Upload content for our /private/ site area
		new s3deploy.BucketDeployment(this, 'DeployPrivateAssets', {
			sources: [s3deploy.Source.asset('./private_assets')],
			destinationBucket: staticAssetBucket,
			destinationKeyPrefix: 'private/static',
		});

		// Create an OriginAccessIdentity to allow access to our S3 bucket
		const staticAssetOAI: OriginAccessIdentity = new OriginAccessIdentity(
			this,
			'OAI',
			{
				comment: 'OAI for website - ' + apex,
			}
		);

		// Get the ARN for the SSL cert created in us-east-1 in our other Stack
		const staticAssetDistroCertificate = new cr.AwsCustomResource(
			this,
			'GetCertArn',
			{
				onUpdate: {
					service: 'SSM',
					action: 'getParameter',
					parameters: {
						Name: apex + '-SSLCertificate',
					},
					region: 'us-east-1',
					physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString()),
				},
				policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
					resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
				}),
			}
		);

		const cognitoCertificate = new cr.AwsCustomResource(
			this,
			'GetCognitoCertArn',
			{
				onUpdate: {
					service: 'SSM',
					action: 'getParameter',
					parameters: {
						Name: 'CognitoCertArn',
					},
					region: 'us-east-1',
					physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString()),
				},
				policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
					resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
				}),
			}
		);

		const privateLambdaRedirectArn = new cr.AwsCustomResource(
			this,
			'GetLambdaArn',
			{
				onUpdate: {
					service: 'SSM',
					action: 'getParameter',
					parameters: {
						Name: 'PrivateLambdaRedirectArn',
					},
					region: 'us-east-1',
					physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString()),
				},
				policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
					resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
				}),
			}
		);

		const subdomainLambdaArn = new cr.AwsCustomResource(
			this,
			'GetSubdomainLambdaArn',
			{
				onUpdate: {
					service: 'SSM',
					action: 'getParameter',
					parameters: {
						Name: 'SubdomainLambdaArn',
					},
					region: 'us-east-1',
					physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString()),
				},
				policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
					resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
				}),
			}
		);

		// Configure the properties for our Cloudfront distribution
		const staticAssetViewerCert: ViewerCertificate = ViewerCertificate.fromAcmCertificate(
			acm.Certificate.fromCertificateArn(
				this,
				'StaticAssetViewerCert',
				staticAssetDistroCertificate.getResponseField('Parameter.Value')
			),
			// Get our list of SANs and append the apex domain
			{
				aliases: subjectAlternateNames.concat(apex),
				securityPolicy: SecurityPolicyProtocol.TLS_V1_2_2019,
			}
		);

		// Configure the properties for our Cloudfront distribution
		const staticAssetDistroProps: CloudFrontWebDistributionProps = {
			originConfigs: [
				{
					s3OriginSource: {
						s3BucketSource: staticAssetBucket,
						originPath: '/www/static',
						// Link an OAI to allow access to S3 from Cloudfront
						originAccessIdentity: staticAssetOAI,
					},
					behaviors: [
						{
							isDefaultBehavior: true,
							compress: true,
							lambdaFunctionAssociations: [
								{
									eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
									lambdaFunction: lambda.Version.fromVersionArn(
										this,
										'RedirectLambdaVersion',
										privateLambdaRedirectArn.getResponseField('Parameter.Value')
									),
								},
								{
									eventType: LambdaEdgeEventType.VIEWER_REQUEST,
									lambdaFunction: lambda.Version.fromVersionArn(
										this,
										'SubdomainLambdaVersion',
										subdomainLambdaArn.getResponseField('Parameter.Value')
									),
								},
							],
						},
					],
				},
			],
			viewerCertificate: staticAssetViewerCert,
			viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
			defaultRootObject: 'index.html',
			loggingConfig: {
				bucket: logBucket,
				includeCookies: true,
				prefix: apex,
			},
			comment: 'Cloudfront Distribution for website - ' + apex,
		};

		// Create our Cloudfront Distribution
		const staticAssetDistro = new CloudFrontWebDistribution(
			this,
			'StaticAssetDistro',
			staticAssetDistroProps
		);

		// Create DNS record targetting our Cloudfront Distribution
		new route53.ARecord(this, 'ApexRecord', {
			zone: hostedZone,
			comment: 'Apex Record targetting Cloudfront Distribution for ' + apex,
			target: route53.RecordTarget.fromAlias(
				new route53_targets.CloudFrontTarget(staticAssetDistro)
			),
		});

		for (var fqdn of subjectAlternateNames) {
			new route53.CnameRecord(this, fqdn.split('.')[0] + 'CnameRecord', {
				zone: hostedZone,
				comment: 'Alias ' + fqdn + ' to our Cloudfront Distribution',
				recordName: fqdn,
				domainName: apex,
			});
		}

		const blogSite = new lambda.Function(this, 'BlogHandler', {
			runtime: lambda.Runtime.NODEJS_12_X,
			code: lambda.Code.fromAsset(path.join(__dirname, '../functions/blog')),
			handler: 'index.handler',
		});

		const blogBackendSSLCert = new acm.Certificate(this, 'BlogBackendCert', {
			domainName: 'blog-backend.' + apex,
			validation: acm.CertificateValidation.fromDns(hostedZone),
		});

		const blogBackendAPIGw = new apigw.LambdaRestApi(this, 'BlogEndpoint', {
			domainName: {
				domainName: 'blog-backend.' + apex,
				certificate: blogBackendSSLCert,
			},
			handler: blogSite,
		});

		new route53.ARecord(this, 'BlogBackendRecord', {
			zone: hostedZone,
			comment: 'DNS Record for the API Gateway Custom Domain for our Blog',
			recordName: 'blog-backend',
			target: route53.RecordTarget.fromAlias(
				new route53_targets.ApiGateway(blogBackendAPIGw)
			),
		});

		const websiteUserPool = new UserPool(this, 'WebsiteUserPool', {
			userPoolName: 'website-userpool',
		});

		websiteUserPool.addClient('AppClient', {
			preventUserExistenceErrors: true,
		});

		websiteUserPool.addDomain('CognitoDomain', {
			cognitoDomain: {
				domainPrefix: 'gofastercloud',
			},
		});

		const authDomain = websiteUserPool.addDomain('CustomDomain', {
			customDomain: {
				domainName: 'auth.' + apex,
				certificate: acm.Certificate.fromCertificateArn(
					this,
					'CognitoCert',
					cognitoCertificate.getResponseField('Parameter.Value')
				),
			},
		});

		new route53.ARecord(this, 'CognitoCustomDomain', {
			zone: hostedZone,
			comment: '',
			recordName: 'auth',
			target: route53.RecordTarget.fromAlias(
				new route53_targets.UserPoolDomainTarget(authDomain)
			),
		});
	}
}
