# proxy-switcheroo

A smart WebExtension that automatically switches proxy settings based on network conditions using an IFTTT-style rule engine. Perfect for users who frequently move between different networks (office, home, public Wi-Fi) and need seamless proxy configuration.

## ✨ Features

### Intelligent Proxy Switching

- **Automatic detection** of network changes and conditions
- **IFTTT-style rules** for flexible automation triggers
- **Manual override** with one-click profile switching
- **Real-time evaluation** with configurable intervals

### Multiple Proxy Support

- **Direct connection** (no proxy)
- **System proxy** settings
- **Manual configuration** (HTTP, HTTPS, SOCKS4/5)
- **PAC scripts** for complex routing
- **Per-request routing** with hostname patterns

### Smart Triggers

- **DNS resolution** testing (detect corporate networks)
- **IP geolocation** checking (identify network provider)
- **Captive portal** detection (public Wi-Fi handling)
- **Reachability tests** (ping internal services)
- **Time windows** (work hours automation)
- **Manual flags** (custom conditions)

### User Interface

- **Popup interface** for quick profile switching
- **Comprehensive options page** for configuration
- **Rule builder** with visual trigger setup
- **Import/export** configuration management
- **Status monitoring** with evaluation logs

### Enterprise Ready

- **Secure credential handling** (Base64 auth headers)
- **Configuration backup/restore**
- **Detailed logging** with multiple levels
- **Performance optimised** with result caching
- **Network timeout handling**

## 📦 Installation

### From Firefox Add-ons (Coming Soon)

Will be available on [Firefox Add-ons](https://addons.mozilla.org/) once published.

### Manual Installation (Development)

1. **Clone the repository**

   ```bash
   git clone https://github.com/krzko/proxy-switcheroo.git
   cd proxy-switcheroo
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the extension**

   ```bash
   npm run build
   # or use the build script
   ./build.sh
   ```

4. **Load in Firefox**

   - Open Firefox and navigate to `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Select `extension/manifest.json` from the project directory

   **Note**: The extension requires TypeScript compilation. Make sure you run the build step first to compile `.ts` files to `.js` with proper ES module imports.

### Production Build

```bash
npm run build-extension
```

This creates a signed package in the `build/` directory.

## 🚀 Quick Start

### Basic Setup

1. **Install the extension** (see installation steps above)

2. **Open the options page**

   - Click the extension icon in the toolbar
   - Click the gear (⚙️) button to open options

3. **Create your first profile**

   - Go to the "Profiles" tab
   - Click "Add Profile"
   - Configure your proxy settings (e.g., company proxy)

4. **Create an automation rule**

   - Go to the "Rules" tab
   - Click "Add Rule"
   - Set up triggers (e.g., DNS resolution for `intranet.company.com`)
   - Select the profile to activate

5. **Enable auto mode**
   - Click the extension icon
   - Toggle "Auto Mode" on
   - The extension will now automatically switch profiles based on your rules

### Example Configurations

#### Work Network Detection

```
Rule: "Office Network"
Trigger: DNS Resolve → hostname: intranet.company.com
Action: Activate "Company Proxy" profile
```

#### Home Network Detection

```
Rule: "Home Network"
Trigger: IP Info → expectOrg: "Home ISP Provider"
Action: Activate "Direct Connection" profile
```

#### Public Wi-Fi Handling

```
Rule: "Captive Portal"
Trigger: Captive Portal → state: locked
Action: Activate "Direct Connection" profile
```

## 🔧 Development

### Prerequisites
- Node.js 18+
- Firefox 115+ (for testing)
- `pnpm`

### Development Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/krzko/proxy-switcheroo.git
   cd proxy-switcheroo
   pnpm install
   ```

2. **Development commands**

   ```bash
   # Compile TypeScript and run in Firefox
   pnpm run dev
   
   # Run in Firefox Nightly
   pnpm run dev:nightly
   
   # Compile TypeScript only
   pnpm run compile
   
   # Watch for changes
   pnpm run watch
   
   # Lint the extension
   pnpm run lint
   
   # Build production package
   pnpm run build-extension
   ```

## 📚 Usage Guide

### Managing Profiles

**Direct Connection**

```
Mode: Direct
Description: No proxy, direct internet access
Use case: Home networks, mobile hotspots
```

**Manual Proxy**

```
Mode: Manual
HTTP Proxy: proxy.company.com:8080
HTTPS Proxy: proxy.company.com:8080
Bypass List: localhost, 127.0.0.1, *.local
Use case: Corporate networks with explicit proxy
```

**PAC Script**

```
Mode: PAC
URL: http://proxy.company.com/proxy.pac
Use case: Complex corporate routing rules
```

**Per-Request Routing**

```
Mode: Per-Request
Rules:
  - *.company.com → company-proxy:8080
  - *.internal → direct
  - * → backup-proxy:3128
Use case: Mixed environments with different routing needs
```

### Creating Rules

**Rule Structure:**

- **Name**: Descriptive identifier
- **Priority**: Lower numbers evaluated first
- **Enabled**: Active/inactive toggle
- **Triggers**: Conditions to match (AND logic)
- **Action**: Profile to activate when matched

**Available Triggers:**

1. **DNS Resolution**
   - Test if a hostname resolves
   - Check if IP is in specific CIDR ranges
   - Detect corporate vs public DNS

2. **Reachability**
   - HTTP/HTTPS connectivity tests
   - Specific status code expectations
   - Timeout handling

3. **IP Information**
   - Public IP geolocation
   - ISP/organisation detection
   - Country-based routing

4. **Captive Portal**
   - Public Wi-Fi detection
   - Automatic portal handling
   - State-based switching

5. **Time Windows**
   - Day of week restrictions
   - Time range limitations
   - Timezone support

6. **Manual Flags**
   - Custom trigger conditions
   - Override mechanisms

### Import/Export Configuration

**Export Configuration**
1. Open Options → Click "Export Config"
2. Save the JSON file with your profiles and rules
3. Share or backup the configuration

**Import Configuration**
1. Open Options → Click "Import Config"
2. Select your JSON configuration file
3. Confirm the import to replace current settings

**Configuration Format:**
```json
{
  "profiles": [
    {
      "id": "work-proxy",
      "name": "Work Proxy",
      "mode": "manual",
      "manual": {
        "http": {"host": "proxy.work.com", "port": 8080},
        "https": {"host": "proxy.work.com", "port": 8080},
        "bypassList": ["localhost", "*.local"]
      }
    }
  ],
  "rules": [
    {
      "id": "work-network",
      "name": "Work Network Detection",
      "enabled": true,
      "priority": 100,
      "when": {
        "dnsResolve": {
          "hostname": "intranet.work.com"
        }
      },
      "then": {
        "setActiveProfile": "work-proxy"
      }
    }
  ]
}
```

## 🔐 Security & Privacy

### Security Features

- **No telemetry** or data collection
- **Local storage only** - configurations never leave your device
- **Secure credential handling** - passwords stored as Base64 auth headers
- **Minimal permissions** - only requests necessary browser APIs
- **Input validation** - all user inputs sanitised and validated

### Privacy Considerations

- **Network probes** only test connectivity, no data transmitted
- **DNS queries** are standard resolution requests
- **IP geolocation** uses public services (configurable endpoint)
- **All processing** happens locally in the browser

### Permissions Explained

- `proxy` - Required to configure Firefox proxy settings
- `storage` - Local storage for profiles and rules
- `alarms` - Periodic rule evaluation scheduling
- `notifications` - Optional notifications for profile changes
- `captivePortal` - Detect public Wi-Fi login pages
- `dns` - Test DNS resolution for network detection
- `<all_urls>` - Required for per-request proxy routing

## 🐛 Troubleshooting

### Debug Mode

1. **Enable debug logging**
   - Open Options → Settings
   - Set Log Level to "Debug"
   - Enable Console Logging

2. **View logs**
   - Open Options → Logs tab
   - Filter by component or level
   - Export logs for analysis

3. **Manual rule testing**
   - Open Options → Rules
   - Click "Test" on any rule
   - Check immediate trigger results
