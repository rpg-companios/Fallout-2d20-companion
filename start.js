const { exec } = require('child_process');

console.log('Starting Expo web server...');

const expo = exec('node_modules/.bin/expo export --platform web && node_modules/.bin/serve -s dist -l 5000', {
  stdio: 'inherit'
});

expo.stdout && expo.stdout.pipe(process.stdout);
expo.stderr && expo.stderr.pipe(process.stderr);

expo.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

expo.on('close', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});
