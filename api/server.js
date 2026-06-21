const express = require('express');
const cors = require('cors');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const app = express();
app.use(cors());
app.use(express.json());

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE = 'desknear-spaces';

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'DeskNear API', version: '1.0.0' });
});

// List all spaces with pagination and filtering
app.get('/api/spaces', async (req, res) => {
  try {
    const { limit = 12, lastKey, state, city, search, priceRange, amenities } = req.query;
    
    let params = {
      TableName: TABLE,
      Limit: parseInt(limit),
    };

    if (lastKey) {
      params.ExclusiveStartKey = JSON.parse(Buffer.from(lastKey, 'base64').toString());
    }

    // Use state-city index if filtering by location
    if (state && city) {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'state-city-index',
        KeyConditionExpression: '#s = :state AND begins_with(#c, :city)',
        ExpressionAttributeNames: { '#s': 'state', '#c': 'city' },
        ExpressionAttributeValues: { ':state': state, ':city': city },
        Limit: parseInt(limit),
      }));
      return res.json({
        spaces: result.Items,
        lastKey: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : null,
        count: result.Count,
      });
    }

    if (state) {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'state-city-index',
        KeyConditionExpression: '#s = :state',
        ExpressionAttributeNames: { '#s': 'state' },
        ExpressionAttributeValues: { ':state': state },
        Limit: parseInt(limit),
      }));
      return res.json({
        spaces: result.Items,
        lastKey: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : null,
        count: result.Count,
      });
    }

    // Scan with optional filters
    let filterExpression = [];
    let expressionAttributeValues = {};
    let expressionAttributeNames = {};

    if (search) {
      filterExpression.push('contains(#name, :search) OR contains(#city, :search)');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeNames['#city'] = 'city';
      expressionAttributeValues[':search'] = search;
    }
    if (priceRange) {
      filterExpression.push('#pr = :pr');
      expressionAttributeNames['#pr'] = 'priceRange';
      expressionAttributeValues[':pr'] = priceRange;
    }
    if (amenities) {
      const amenityList = amenities.split(',');
      amenityList.forEach((a, i) => {
        filterExpression.push(`contains(#amenities, :amenity${i})`);
        expressionAttributeValues[`:amenity${i}`] = a.trim();
      });
      expressionAttributeNames['#amenities'] = 'amenities';
    }

    if (filterExpression.length > 0) {
      params.FilterExpression = filterExpression.join(' AND ');
      params.ExpressionAttributeValues = expressionAttributeValues;
      params.ExpressionAttributeNames = expressionAttributeNames;
    }

    const result = await docClient.send(new ScanCommand(params));
    res.json({
      spaces: result.Items,
      lastKey: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : null,
      count: result.Count,
      scannedCount: result.ScannedCount,
    });
  } catch (err) {
    console.error('Error fetching spaces:', err);
    res.status(500).json({ error: 'Failed to fetch spaces' });
  }
});

// Get single space by ID
app.get('/api/spaces/:id', async (req, res) => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE,
      Key: { id: parseInt(req.params.id) },
    }));
    
    if (!result.Item) {
      return res.status(404).json({ error: 'Space not found' });
    }
    
    res.json(result.Item);
  } catch (err) {
    console.error('Error fetching space:', err);
    res.status(500).json({ error: 'Failed to fetch space' });
  }
});

// Get spaces by state (for directory)
app.get('/api/states/:state', async (req, res) => {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE,
      IndexName: 'state-city-index',
      KeyConditionExpression: '#s = :state',
      ExpressionAttributeNames: { '#s': 'state' },
      ExpressionAttributeValues: { ':state': req.params.state },
    }));
    res.json({ spaces: result.Items, count: result.Count });
  } catch (err) {
    console.error('Error fetching by state:', err);
    res.status(500).json({ error: 'Failed to fetch spaces by state' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`DeskNear API running on port ${PORT}`);
});
