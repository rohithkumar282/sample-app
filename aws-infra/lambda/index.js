const {
  DynamoDBClient,
  PutItemCommand,
  DeleteItemCommand,
  ScanCommand
} = require("@aws-sdk/client-dynamodb");
const { ApiGatewayManagementApi } = require("@aws-sdk/client-apigatewaymanagementapi");

const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.CONNECTIONS_TABLE;

exports.handler = async (event) => {
  console.log("Event:", JSON.stringify(event, null, 2));

  const connectionId = event.requestContext.connectionId;
  const routeKey = event.requestContext.routeKey;

  if (routeKey === "$connect") {
    await ddb.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: { connectionId: { S: connectionId } }
    }));
    return { statusCode: 200 };
  }

  if (routeKey === "$disconnect") {
    await ddb.send(new DeleteItemCommand({
      TableName: TABLE_NAME,
      Key: { connectionId: { S: connectionId } }
    }));
    return { statusCode: 200 };
  }

  if (routeKey === "$default") {
    const body = event.body;

    // Get all connections
    const connections = await ddb.send(new ScanCommand({ TableName: TABLE_NAME }));

    const apigw = new ApiGatewayManagementApi({
      endpoint: `${event.requestContext.domainName}/${event.requestContext.stage}`
    });

    // Broadcast to all connected clients
    await Promise.all(connections.Items.map(async (item) => {
      try {
        await apigw.postToConnection({
          ConnectionId: item.connectionId.S,
          Data: body
        });
      } catch (err) {
        console.error("Failed to send to", item.connectionId.S, err);
      }
    }));

    return { statusCode: 200 };
  }

  return { statusCode: 200 };
};