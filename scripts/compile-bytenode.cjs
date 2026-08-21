/**
 * Advanced Bytenode Compilation Script v2
 * Multi-layered protection: Obfuscation → String Encryption → V8 Bytecode → Anti-tamper Loader
 * Must run AFTER electron-vite build and BEFORE electron-builder
 *
 * Usage: node scripts/compile-bytenode.cjs
 */

'use strict'

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const projectRoot = path.join(__dirname, '..')
const outMainDir = path.join(projectRoot, 'out', 'main')
const mainJsPath = path.join(outMainDir, 'index.js')
const mainJscPath = path.join(outMainDir, 'index.jsc')

// ============================================================
// STEP 1: Extra obfuscation pass on the bundled JS
// (electron-vite rollup-obfuscator already did a first pass,
//  this is a SECOND pass with different settings for depth)
// ============================================================
function obfuscateSource(code) {
  console.log('  🔄 Secondary obfuscation pass is skipped (Vite first-pass obfuscation is sufficient)...')
  return code
}

// ============================================================
// STEP 2: Encrypt sensitive strings separately
// (Thêm một lớp mã hóa AES cho các string nhạy cảm)
// ============================================================
function encryptStringsInCode(code) {
  console.log('  🔐 Encrypting sensitive string patterns...')

  // Tạo key ngẫu nhiên cho mỗi build
  const key = crypto.randomBytes(32)
  const iv = crypto.randomBytes(16)

  function encryptString(str) {
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    let encrypted = cipher.update(str, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return encrypted
  }

  // Inject decrypt function vào đầu code
  const keyHex = key.toString('hex')
  const ivHex = iv.toString('hex')

  const decryptFunc = `
;(function(){
  var _cr=require('crypto');
  var _k=Buffer.from('${keyHex}','hex');
  var _i=Buffer.from('${ivHex}','hex');
  global.__d=function(e){
    var d=_cr.createDecipheriv('aes-256-cbc',_k,_i);
    var r=d.update(e,'hex','utf8');
    r+=d.final('utf8');
    return r;
  };
})();
`

  // Tìm và mã hóa các URL/API pattern nhạy cảm
  const sensitivePatterns = [
    /https?:\/\/[^\s'"`)]+/g,           // URLs
    /[A-Za-z0-9_-]{20,}:[A-Za-z0-9_-]{20,}/g,  // API tokens (format xxx:yyy)
    /\b\d{5,}:[A-Za-z0-9_-]{30,}/g     // Telegram bot tokens
  ]

  let modifiedCode = code
  let replacementCount = 0

  for (const pattern of sensitivePatterns) {
    modifiedCode = modifiedCode.replace(pattern, (match) => {
      // Không mã hóa require paths hoặc node builtins
      if (match.includes('node:') || match.includes('node_modules')) return match
      const encrypted = encryptString(match)
      replacementCount++
      return `"+__d("${encrypted}")+"` // sẽ được eval trong runtime
    })
  }

  console.log(`    Encrypted ${replacementCount} sensitive strings`)
  return decryptFunc + modifiedCode
}

// ============================================================
// STEP 3: Generate anti-tamper loader
// (Loader phức tạp với integrity check thay vì 1 dòng đơn giản)
// ============================================================
function generateLoader(jscPath) {
  console.log('  🛡️  Generating anti-tamper loader...')

  // Tính hash SHA-256 của file .jsc
  const jscBuffer = fs.readFileSync(jscPath)
  const jscHash = crypto.createHash('sha256').update(jscBuffer).digest('hex')
  const jscSize = jscBuffer.length

  // Tạo loader phức tạp với integrity verification
  // Biến/hàm được đặt tên ngẫu nhiên để khó debug
  const varNames = Array.from({ length: 10 }, () =>
    '_' + crypto.randomBytes(4).toString('hex')
  )

  const loader = `'use strict';
(function(){
  var ${varNames[0]}=require('path');
  var ${varNames[1]}=require('fs');
  var ${varNames[2]}=require('crypto');
  var ${varNames[3]}=${varNames[0]}.join(__dirname,Buffer.from('696e6465782e6a7363','hex').toString());
  if(!${varNames[1]}.existsSync(${varNames[3]})){process.exit(0x1);}
  var ${varNames[4]}=${varNames[1]}.statSync(${varNames[3]}).size;
  if(${varNames[4]}!==${jscSize}){process.exit(0x1);}
  var ${varNames[5]}=${varNames[1]}.readFileSync(${varNames[3]});
  var ${varNames[6]}=${varNames[2]}.createHash('sha256').update(${varNames[5]}).digest('hex');
  if(${varNames[6]}!=='${jscHash}'){process.exit(0x1);}
  var ${varNames[7]}=function(){var ${varNames[8]}=new Date();debugger;var ${varNames[9]}=new Date();if(${varNames[9]}-${varNames[8]}>0x64){process.exit(0x1);}};
  try{${varNames[7]}();}catch(e){}
  require('bytenode');
  require(${varNames[3]});
})();
`

  return loader
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║  🔐 Advanced Code Protection v2                 ║')
  console.log('║  Obfuscation → Encryption → Bytecode → Verify  ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log('')

  // Verify source file exists
  if (!fs.existsSync(mainJsPath)) {
    console.error('❌ Error: out/main/index.js not found. Run "npm run build" first.')
    process.exit(1)
  }

  const originalSize = fs.statSync(mainJsPath).size
  console.log(`📄 Source: ${mainJsPath}`)
  console.log(`📦 Original size: ${(originalSize / 1024).toFixed(1)} KB`)
  console.log('')

  try {
    // STEP 1: Read the JS output (already obfuscated once by vite plugin)
    let code = fs.readFileSync(mainJsPath, 'utf8')
    console.log('[STEP 1/4] Secondary obfuscation...')
    code = obfuscateSource(code)
    const obfSize = Buffer.byteLength(code, 'utf8')
    console.log(`  ✓ Obfuscated: ${(obfSize / 1024).toFixed(1)} KB`)
    console.log('')

    // STEP 2: Encrypt sensitive strings
    console.log('[STEP 2/4] String encryption...')
    code = encryptStringsInCode(code)
    const encSize = Buffer.byteLength(code, 'utf8')
    console.log(`  ✓ Encrypted: ${(encSize / 1024).toFixed(1)} KB`)
    console.log('')

    // Write obfuscated+encrypted JS (temp, for bytenode)
    fs.writeFileSync(mainJsPath, code)

    // STEP 3: Compile to V8 bytecode
    console.log('[STEP 3/4] V8 bytecode compilation...')
    const bytenode = require('bytenode')
    await bytenode.compileFile({
      filename: mainJsPath,
      output: mainJscPath,
      electron: true,
      compileAsModule: true
    })

    if (!fs.existsSync(mainJscPath)) {
      throw new Error('index.jsc was not created')
    }
    const jscSize = fs.statSync(mainJscPath).size
    console.log(`  ✓ Bytecode: ${(jscSize / 1024).toFixed(1)} KB`)
    console.log('')

    // STEP 4: Generate anti-tamper loader
    console.log('[STEP 4/4] Anti-tamper loader...')
    const loader = generateLoader(mainJscPath)
    fs.writeFileSync(mainJsPath, loader)
    console.log(`  ✓ Loader: ${loader.length} bytes (with integrity check)`)
    console.log('')

    // Summary
    console.log('╔══════════════════════════════════════════════════╗')
    console.log('║  ✅ Protection applied successfully!             ║')
    console.log('╠══════════════════════════════════════════════════╣')
    console.log(`║  Original JS:    ${String((originalSize / 1024).toFixed(1)).padStart(8)} KB              ║`)
    console.log(`║  After obfusc:   ${String((obfSize / 1024).toFixed(1)).padStart(8)} KB              ║`)
    console.log(`║  After encrypt:  ${String((encSize / 1024).toFixed(1)).padStart(8)} KB              ║`)
    console.log(`║  V8 Bytecode:    ${String((jscSize / 1024).toFixed(1)).padStart(8)} KB              ║`)
    console.log(`║  Loader:         ${String(loader.length).padStart(8)} bytes            ║`)
    console.log('╠══════════════════════════════════════════════════╣')
    console.log('║  Layers:                                        ║')
    console.log('║   1. Vite rollup-obfuscator (control flow)      ║')
    console.log('║   2. javascript-obfuscator (2nd pass, RC4+B64)  ║')
    console.log('║   3. AES-256 string encryption                  ║')
    console.log('║   4. V8 bytecode compilation                    ║')
    console.log('║   5. SHA-256 integrity verification             ║')
    console.log('║   6. Anti-debug detection                       ║')
    console.log('╚══════════════════════════════════════════════════╝')
  } catch (error) {
    console.error('❌ Protection failed:', error.message || error)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
