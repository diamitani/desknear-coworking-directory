import boto3, json, time, sys, os
from decimal import Decimal

# Use rostr profile
session = boto3.Session(profile_name='rostr', region_name='us-east-1')
dynamodb = session.resource('dynamodb')
table = dynamodb.Table('desknear-spaces')

with open('/Users/pdiamitani/desknear-coworking-directory/spaces.json') as f:
    spaces = json.load(f)

count = 0
errors = 0
for i in range(0, min(200, len(spaces)), 25):
    batch = spaces[i:i+25]
    with table.batch_writer() as writer:
        for space in batch:
            try:
                neighborhood = space.get('neighborhood', '')
                parts = neighborhood.split(', ') if ', ' in neighborhood else [neighborhood, 'Unknown']
                state = parts[-1] if len(parts) > 1 else 'Unknown'
                city = parts[0] if parts[0] else 'Unknown'
                
                item = {
                    'id': int(space['id']),
                    'name': str(space['name']),
                    'state': str(state),
                    'city': str(city),
                    'website': str(space.get('website', '')),
                    'image': str(space.get('image', '')),
                    'rating': Decimal(str(space.get('rating', 4.0))),
                    'reviews': int(space.get('reviews', 0)),
                    'priceRange': str(space.get('priceRange', '$$')),
                    'startingPrice': int(space.get('startingPrice', 250)),
                    'amenities': [str(a) for a in space.get('amenities', [])]
                }
                writer.put_item(Item=item)
                count += 1
            except Exception as e:
                errors += 1
    time.sleep(0.2)
    if i % 50 == 0:
        print(f"Seeded {count}/{min(200, len(spaces))}... (errors: {errors})")

print(f"Done! {count} spaces seeded, {errors} errors")

# Verify
response = table.get_item(Key={'id': 1})
item = response.get('Item', {})
print(f"Sample: id={item.get('id')}, name={item.get('name')}, state={item.get('state')}, city={item.get('city')}")
print(f"Scan count: {table.scan(Select='COUNT')['Count']}")
