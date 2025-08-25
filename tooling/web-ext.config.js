module.exports = {
  // Source directory containing the extension
  sourceDir: './extension',
  
  // Artifacts directory for builds
  artifactsDir: './build',
  
  // Ignore files when building
  ignoreFiles: [
    'src/**/*.ts',
    'src/**/*.map',
    '**/*.log',
    '**/node_modules',
    '**/package*.json',
    '**/.git',
    '**/.gitignore',
    '**/README.md',
    '**/CLAUDE.md',
    '**/tsconfig.json',
    '**/*.config.js'
  ],
  
  // Development server configuration
  run: {
    // Start URL when running extension in development
    startUrl: ['about:debugging#/runtime/this-firefox'],
    
    // Firefox binary path (optional, will use system default)
    // firefox: process.env.FIREFOX_BINARY,
    
    // Firefox profile to use (optional)
    // firefoxProfile: './dev-profile',
    
    // Keep profile changes
    keepProfileChanges: false,
    
    // Browser console output
    browserConsole: true,
    
    // Reload strategy
    reload: true,
    
    // Additional preferences for Firefox
    pref: [
      // Enable extension debugging
      'devtools.chrome.enabled=true',
      'devtools.debugger.remote-enabled=true',
      
      // Disable signature requirement for development
      'xpinstall.signatures.required=false',
      
      // Enable extension developer mode
      'extensions.legacy.enabled=true'
    ]
  },
  
  // Linting configuration
  lint: {
    // Output format
    output: 'text',
    
    // Metadata validation
    metadata: true,
    
    // Warning as errors
    warningsAsErrors: false,
    
    // Self-hosted extensions
    selfHosted: false
  },
  
  // Build configuration
  build: {
    // Override version
    overwriteDest: true,
    
    // Filename template
    filename: 'proxy-switcheroo-{version}.zip'
  },
  
  // Sign configuration (for AMO submission)
  sign: {
    // API key and secret should be set via environment variables:
    // WEB_EXT_API_KEY and WEB_EXT_API_SECRET
    
    // Distribution channel
    channel: 'unlisted',
    
    // Timeout for signing process
    timeout: 120000,
    
    // Download signed XPI
    downloadDir: './signed'
  }
};