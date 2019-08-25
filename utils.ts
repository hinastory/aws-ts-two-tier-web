import * as aws from "@pulumi/aws"
import * as awsx from "@pulumi/awsx"

// get most recent Amazon Linux AMI
export function getAmazonLinux(): Promise<string> {
  return aws.getAmi({
    filters: [
      { name: "name", values: ["amzn-ami-hvm-*"] },
      { name: "virtualization-type", values: ["hvm"] },
      { name: "architecture", values: ["x86_64"] },
      { name: "root-device-type", values: ["ebs"] },
      { name: "block-device-mapping.volume-type", values: ["gp2"] }
    ],
    mostRecent: true,
    owners: ["amazon"]
  }).then(ami => ami.id)
}

// create RDS instance (MySQL)
export function createRDSInstance(vpcPrefix: string, vpc: awsx.ec2.Vpc): aws.rds.Instance {
  // create Security Group for DB
  const dbSg = new awsx.ec2.SecurityGroup(`${vpcPrefix}-db-sg`,
    {
      vpc,
      ingress: [{ protocol: "tcp", fromPort: 3306, toPort: 3306, cidrBlocks: ["0.0.0.0/0"] }],
      egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
    })

  // create Subnet Group for DB
  const dbSubnets = new aws.rds.SubnetGroup(`${vpcPrefix}-dbsubnets`, {
    subnetIds: vpc.privateSubnetIds,
  })

  return new aws.rds.Instance(`${vpcPrefix}-db`, {
    engine: "mysql",
    instanceClass: "db.t2.micro",
    allocatedStorage: 10,
    dbSubnetGroupName: dbSubnets.id,
    vpcSecurityGroupIds: [dbSg.id],
    name: `${vpcPrefix}DbInstance`,
    username: "testdb",
    password: "testdb123",
    multiAz: true,
    skipFinalSnapshot: true,
  })
}

// create Application Load Balancer
export function createApplicationLoadBalancer(vpcPrefix: string, vpc: awsx.ec2.Vpc): awsx.elasticloadbalancingv2.ApplicationLoadBalancer {
  const albSg = new awsx.ec2.SecurityGroup(`${vpcPrefix}-alb-sg`,
    {
      vpc, egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
    })

  return new awsx.lb.ApplicationLoadBalancer(`${vpcPrefix}-web-traffic`, { vpc, securityGroups: [albSg] });
}

// run command for EC2 WebServer
function getRunCmd(title: string, content: string): string {
  return `az=$(curl -s http://169.254.169.254/latest/meta-data/placement/availability-zone)
echo "<html><head><title>${title}</title></head><body><h1>${content} from $az</h1></body></html>" > index.html
nohup python -m SimpleHTTPServer 80 &`
}

// create Auto Scaling Group
export function createAutoScalingGroup(vpcPrefix: string, vpc: awsx.ec2.Vpc, alb: awsx.elasticloadbalancingv2.ApplicationLoadBalancer): awsx.autoscaling.AutoScalingGroup {
  // see https://github.com/pulumi/pulumi-awsx/blob/master/nodejs/awsx/autoscaling/autoscaling.ts#L217
  const userDataLines = getRunCmd("My Web Site", "Hello World").split(`\n`).map(e => ({ contents: `    ${e}`, }) as awsx.autoscaling.UserDataLine)

  return new awsx.autoscaling.AutoScalingGroup(`${vpcPrefix}-web-asg`, {
    vpc,
    subnetIds: vpc.publicSubnets.map(e => e.id),
    targetGroups: alb.targetGroups,
    templateParameters: {
      minSize: 2,
      maxSize: 4,
    },
    launchConfigurationArgs: {
      instanceType: "t2.micro",
      imageId: getAmazonLinux(),
      securityGroups: alb.securityGroups,
      userData: { extraRuncmdLines: () => userDataLines }
    }
  })
}
