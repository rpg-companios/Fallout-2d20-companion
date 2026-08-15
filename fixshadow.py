import json, re

path = 'data/traits/traits.json'
d = json.load(open(path, encoding='utf-8'))

# 1) найти запись без id — это Тень (у неё канонические modifiers)
fixed = 0
for t in d:
    if isinstance(t, dict) and not t.get('id') and t.get('modifiers', {}).get('attributes', {}).get('STR'):
        t['id'] = 'shadow'
        t['originId'] = 'shadow'
        t['displayNameKey'] = 'traits.shadow.shadow.name'
        t['descriptionKey'] = 'traits.shadow.shadow.description'
        fixed += 1
        print('Восстановлена Тень: id/originId/ключи добавлены, modifiers не тронуты')

# 2) починить markdown-ссылки у всех displayNameKey/descriptionKey
def fix(s):
    if isinstance(s, str):
        return re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', s)
    return s

for t in d:
    if isinstance(t, dict):
        for k in ('displayNameKey', 'descriptionKey'):
            if k in t:
                t[k] = fix(t[k])

json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

# 3) контроль
d2 = json.load(open(path, encoding='utf-8'))
s = next(t for t in d2 if t['id'] == 'shadow')
print('записей:', len(d2))
print('shadow id:', s['id'], '| originId:', s['originId'])
print('displayNameKey:', s['displayNameKey'])
print('modifiers:', json.dumps(s['modifiers'], ensure_ascii=False))
print('без id осталось:', [i for i, t in enumerate(d2) if not t.get('id')])
print('OK')