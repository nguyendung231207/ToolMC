const jwt = require('jsonwebtoken')

module.exports = (req, res) => {
  const JWT_SECRET = process.env.JWT_SECRET

  if (!JWT_SECRET) {
    console.error('🔴 CRITICAL: JWT_SECRET not set!')
    return res
      .status(500)
      .send('<h1>Server Error</h1><p>Authentication service is misconfigured.</p>')
  }

  const { k: token } = req.query

  if (!token) {
    return res
      .status(400)
      .send('<h1>No Key Found</h1><p>Invalid link. Please regenerate from the app.</p>')
  }

  // Verify it just to be sure it's one of OUR keys (optional but good for UX)
  try {
    jwt.verify(token, JWT_SECRET)
  } catch (e) {
    return res
      .status(400)
      .send('<h1>Invalid Key</h1><p>This key is corrupted or tampered with.</p>')
  }

  // 2. Return HTML to display the key nicely (Shadcn UI Style)
  const html = `
    <!DOCTYPE html>
    <html lang="en" class="dark">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Access Key | ToolMC</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --background: 240 10% 3.9%;
                --foreground: 0 0% 98%;
                --card: 240 10% 9%; 
                --card-foreground: 0 0% 98%;
                --popover: 240 10% 3.9%;
                --popover-foreground: 0 0% 98%;
                --primary: 0 0% 98%;
                --primary-foreground: 240 5.9% 10%;
                --secondary: 240 3.7% 15.9%;
                --secondary-foreground: 0 0% 98%;
                --muted: 240 3.7% 15.9%;
                --muted-foreground: 240 5% 64.9%;
                --accent: 240 3.7% 15.9%;
                --accent-foreground: 0 0% 98%;
                --destructive: 0 62.8% 30.6%;
                --destructive-foreground: 0 0% 98%;
                --border: 240 3.7% 15.9%;
                --input: 240 3.7% 15.9%;
                --ring: 240 4.9% 83.9%;
                --radius: 0.5rem;
            }

            body {
                background-color: hsl(var(--background));
                color: hsl(var(--foreground));
                font-family: 'Inter', sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                -webkit-font-smoothing: antialiased;
                padding: 1rem;
            }

            .card {
                background-color: hsl(var(--card));
                color: hsl(var(--card-foreground));
                border: 1px solid hsl(var(--border));
                border-radius: var(--radius);
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                width: 100%;
                max-width: 420px;
                padding: 1.5rem;
                text-align: left;
            }

            .card-header { margin-bottom: 1.5rem; }
            .card-title { font-size: 1.5rem; font-weight: 600; margin: 0; letter-spacing: -0.025em; line-height: 1.2; }
            .card-desc { color: hsl(var(--muted-foreground)); font-size: 0.875rem; margin-top: 0.5rem; line-height: 1.5; }

            .key-container {
                position: relative;
                margin-top: 1.5rem;
            }

            label {
                font-size: 0.875rem;
                font-weight: 500;
                line-height: 1;
                margin-bottom: 0.5rem;
                display: block;
            }

            .key-box {
                background-color: hsl(var(--secondary));
                border: 1px solid hsl(var(--input));
                color: hsl(var(--secondary-foreground));
                padding: 0.75rem 2.5rem 0.75rem 0.75rem;
                border-radius: calc(var(--radius) - 2px);
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: 0.875rem;
                word-break: break-all;
                min-height: 2.5rem;
                display: flex;
                align-items: center;
            }

            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: calc(var(--radius) - 2px);
                font-size: 0.875rem;
                font-weight: 500;
                height: 2.5rem;
                padding: 0.5rem 1rem;
                cursor: pointer;
                transition: all 0.15s ease;
                width: 100%;
                margin-top: 1.5rem;
                border: none;
                text-decoration: none;
                user-select: none;
            }

            .btn-primary {
                background-color: hsl(var(--primary));
                color: hsl(var(--primary-foreground));
            }
            .btn-primary:hover { opacity: 0.9; }
            .btn-primary:active { transform: scale(0.98); }

            .btn-copy {
                position: absolute;
                top: 50%;
                right: 4px;
                transform: translateY(-50%);
                height: 2rem;
                width: 2rem;
                background: transparent;
                color: hsl(var(--muted-foreground));
                padding: 0;
                margin: 0;
                border-radius: 4px;
            }
            .btn-copy:hover { color: hsl(var(--foreground)); background: hsl(var(--accent)); }

            .status-text {
                margin-top: 1rem;
                font-size: 0.75rem;
                color: hsl(var(--muted-foreground));
                text-align: center;
            }
            
            svg { width: 16px; height: 16px; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="card-header">
                <h1 class="card-title">Authentication Key</h1>
                <p class="card-desc">Copy the access token below and paste it into the ToolMC application to verify your session.</p>
            </div>
            
            <div class="key-container">
                <label>Access Token</label>
                <div style="position: relative;">
                    <div class="key-box" id="keyText">${token}</div>
                    <button class="btn btn-copy" onclick="copyKey()" title="Copy to clipboard">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5" />
                        </svg>
                    </button>
                </div>
            </div>

            <button class="btn btn-primary" onclick="copyKey()" id="mainBtn">
                Copy Key to Clipboard
            </button>

            <p class="status-text">Valid for 24 hours • Powered by Vercel</p>
        </div>

        <script>
            function copyKey() {
                const keyText = document.getElementById('keyText').innerText;
                navigator.clipboard.writeText(keyText).then(() => {
                    const btn = document.getElementById('mainBtn');
                    const originalText = btn.innerText;
                    btn.innerText = 'Copied!';
                    
                    setTimeout(() => { 
                        btn.innerText = originalText; 
                    }, 2000);
                });
            }
        </script>
    </body>
    </html>
    `

  res.setHeader('Content-Type', 'text/html')
  res.status(200).send(html)
}
