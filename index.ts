import * as pulumi from "@pulumi/pulumi"
import * as awsx from "@pulumi/awsx"
import * as utils from "./utils"

const config = new pulumi.Config("aws-ts-two-tier-web");

const vpcPrefix = config.require("vpcName")

// create vpc (2 public subnets, 2 private subnets)
const vpc = new awsx.ec2.Vpc(vpcPrefix)

// create RDS instance
const db = utils.createRDSInstance(vpcPrefix, vpc)

// create Application Load Balancer
const alb = utils.createApplicationLoadBalancer(vpcPrefix, vpc);

// create Target Group for Auto Scaling
const targetGroup = alb.createTargetGroup(`${vpcPrefix}-web-tg`, { port: 80, targetType: "instance" });

// create Listener for Application Load Balancer
const listener = targetGroup.createListener(`${vpcPrefix}-web-listener`, { port: 80 })

// create Listener for Auto Scaling Group
const autoScalingGroup = utils.createAutoScalingGroup(vpcPrefix, vpc, alb)

// create scaling policy (CPU Utilization 50%)
autoScalingGroup.scaleToTrackAverageCPUUtilization("keepAround50Percent", { targetValue: 50 })

// output variables
export const vpcId = vpc.id
export const vpcPrivateSubnetIds = vpc.privateSubnetIds
export const vpcPublicSubnetIds = vpc.publicSubnetIds
export const dbEndpoint = db.endpoint
export const endpoint = listener.endpoint.hostname