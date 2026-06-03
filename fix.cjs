const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');
code = code.split('isSaus ? cleanName : ` - `').join('isSaus ? cleanName : `${cleanName} - ${count}`');
fs.writeFileSync('src/App.tsx', code);
