# -*- coding: utf-8 -*-
import json, urllib.request, ssl
ctx = ssl.create_default_context()
url = 'https://v0-tsa-19.vercel.app/api/recipe?limit=3'
req = urllib.request.Request(url)
try:
    data = json.loads(urllib.request.urlopen(req, context=ctx).read().decode('utf-8'))
    if 'data' in data:
        for r in data['data'][:3]:
            row = {
                'name': r.get('name'),
                'linked_wholesale_product_id': r.get('linked_wholesale_product_id'),
                'linked_oem_product_id': r.get('linked_oem_product_id'),
                'ingredient_count': r.get('ingredient_count'),
            }
            print(json.dumps(row, ensure_ascii=False))
        print('Total:', len(data['data']))
    elif 'error' in data:
        print('Error:', data['error'])
    else:
        print(json.dumps(data, ensure_ascii=False)[:500])
except Exception as e:
    print('HTTP Error:', e)
