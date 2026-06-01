const http = require('http');
http.get('http://localhost:5174/', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if(data.includes('ErrorOverlay') || data.includes('ReferenceError') || data.includes('SyntaxError')) {
      console.log('Error found in HTML');
    } else {
      console.log('HTML loads fine');
    }
  });
}).on('error', (e) => {
  console.log('Connection error:', e);
});
