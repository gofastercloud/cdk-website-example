import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as ssm from '@aws-cdk/aws-ssm';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';

export class LambdaEdgeStack extends cdk.Stack {
	constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const apex: string = this.node.tryGetContext('domain_name');

		const edgeLambdaExecutionRole: iam.Role = new iam.Role(
			this,
			'EdgeLambdaExecutionRole',
			{
				assumedBy: new iam.CompositePrincipal(
					new iam.ServicePrincipal('lambda.amazonaws.com'),
					new iam.ServicePrincipal('edgelambda.amazonaws.com')
				),
				managedPolicies: [
					iam.ManagedPolicy.fromAwsManagedPolicyName(
						'service-role/AWSLambdaBasicExecutionRole'
					),
				],
			}
		);

		const originRedirectLambda: lambda.Function = new lambda.Function(
			this,
			'OriginRedirectLambda',
			{
				code: lambda.Code.fromAsset(
					path.join(__dirname, '../functions/origin-redirect-lambda')
				),
				runtime: lambda.Runtime.NODEJS_12_X,
				handler: 'index.handler',
				role: edgeLambdaExecutionRole,
			}
		);

		const originRedirectLambdaVersion: lambda.Version = new lambda.Version(
			this,
			'OriginRedirectLambdaVersion',
			{
				lambda: originRedirectLambda,
			}
		);

		const subdomainLambda: lambda.Function = new lambda.Function(
			this,
			'SubdomainLambda',
			{
				code: lambda.Code.fromAsset(
					path.join(__dirname, '../functions/handle-subdomains-lambda')
				),
				runtime: lambda.Runtime.NODEJS_12_X,
				handler: 'index.handler',
				role: edgeLambdaExecutionRole,
			}
		);

		const subDomainLambdaVersion: lambda.Version = new lambda.Version(
			this,
			'SubdomainLambdaVersion',
			{
				lambda: subdomainLambda,
			}
		);

		new ssm.StringParameter(this, 'OriginRedirectLambdaARN', {
			description: 'ARN for our Origin Redirect Lambda Function',
			parameterName: 'OriginLambdaRedirectArn',
			stringValue: originRedirectLambdaVersion.functionArn,
		});

		new ssm.StringParameter(this, 'SubdomainLambdaARN', {
			description: 'ARN for our Handle Subdomain Lambda Function',
			parameterName: 'SubdomainLambdaArn',
			stringValue: subDomainLambdaVersion.functionArn,
		});
	}
}
