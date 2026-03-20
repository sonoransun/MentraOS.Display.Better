# Git Best Practices for Enhanced MentraOS Application

## 📋 Repository Configuration Overview

This repository is configured with comprehensive Git settings to ensure maximum security, efficiency, and collaboration effectiveness.

### 🔒 **Security & Privacy Protection**

#### Critical Files Never Committed:
- **Environment files** (`.env*`) - Contains API keys and secrets
- **SSL certificates** (`*.pem`, `*.key`, `*.crt`) - Security credentials
- **Database dumps** (`*.rdb`, `*.sqlite`) - Potentially sensitive data
- **User data** (`user-data/`, `preferences/`) - Privacy protection
- **AI model files** (`*.h5`, `*.pb`) - Large binary files
- **Logs and dumps** (`*.log`, `*.dump`) - May contain sensitive information

#### What TO Check for Before Every Commit:
```bash
# Always check what you're committing
git status
git diff --cached

# Look for sensitive data
git diff --cached | grep -i "password\|secret\|key\|token"
```

### 📁 **Directory Structure Protection**

#### Automatically Ignored:
```
node_modules/          # Dependencies (regeneratable)
dist/                  # Build outputs (regeneratable)
coverage/              # Test coverage (regeneratable)
.vscode/              # IDE settings (personal)
logs/                 # Runtime logs
tmp/                  # Temporary files
```

#### Tracked Empty Directories:
```
src/vision/           # Computer vision pipeline (Phase 2)
src/ai/               # AI/ML engines (Phase 2)
src/accessibility/    # Accessibility features (Phase 4)
src/ui/               # 3D spatial UI (Phase 4)
src/security/         # Security framework (Phase 5)
src/analytics/        # Analytics platform (Phase 5)
```

### 🚀 **Development Workflow**

#### Recommended Git Commands:

```bash
# Safe commit workflow
git add -A                    # Add all changes
git status                    # Review what's being committed
git commit -m "type: description"

# Before pushing
git log --oneline -5          # Review recent commits
git push origin main
```

#### Commit Message Convention:
```
feat: add new feature
fix: bug fix
docs: documentation changes
style: formatting, missing semi colons, etc
refactor: code refactoring
test: adding tests
chore: updating build tasks, package manager configs, etc
security: security improvements
perf: performance improvements
```

### 🔧 **File Type Handling**

#### Automatic Line Ending Normalization:
- **All text files**: Unix line endings (`LF`)
- **Windows scripts**: Windows line endings (`CRLF`)
- **Shell scripts**: Unix line endings (`LF`)

#### Binary File Detection:
- **Images**: Treated as binary, optimized storage
- **AI Models**: Binary handling, consider Git LFS for large files
- **Certificates**: Binary, never show in diffs
- **Archives**: Binary, compressed storage

### 📊 **Large File Management**

#### When to Use Git LFS (Large File Storage):
```bash
# Install Git LFS
git lfs install

# Track large AI models (if needed)
git lfs track "models/*.h5"
git lfs track "models/*.pb"
git lfs track "datasets/*.csv"

# Commit the .gitattributes changes
git add .gitattributes
git commit -m "chore: configure Git LFS for large AI models"
```

#### File Size Recommendations:
- **< 1MB**: Regular Git storage
- **1-50MB**: Consider Git LFS
- **> 50MB**: Definitely use Git LFS or external storage

### 🌟 **Collaboration Best Practices**

#### Before Contributing:
1. **Review .gitignore**: Understand what's excluded
2. **Check for secrets**: Never commit API keys or passwords
3. **Test locally**: Ensure `bun run test` passes
4. **Lint code**: Run `bun run lint` before committing

#### Pull Request Workflow:
```bash
# Create feature branch
git checkout -b feature/new-ai-capability
git add src/ai/new-feature.ts
git commit -m "feat: add new AI capability for object detection"
git push origin feature/new-ai-capability

# Create PR on GitHub/GitLab
```

#### Merge Strategies:
- **Feature branches**: Squash and merge
- **Bug fixes**: Regular merge
- **Hot fixes**: Fast-forward merge

### 🛡️ **Security Scanning**

#### Pre-commit Checks:
```bash
# Check for secrets (install git-secrets)
git secrets --scan

# Check for sensitive files
git ls-files | grep -E "\.(env|key|pem|crt)$"

# Review large files
git ls-files | xargs ls -la | sort -k5 -nr | head -20
```

#### Repository Maintenance:
```bash
# Clean up untracked files
git clean -fd

# Optimize repository
git gc --aggressive

# Check repository integrity
git fsck
```

### 📈 **Performance Optimization**

#### Git Configuration:
```bash
# Optimize for large repositories
git config core.preloadindex true
git config core.fscache true
git config gc.auto 256

# Better diff algorithms
git config diff.algorithm patience
git config merge.renameLimit 999999
```

#### Exclude Patterns for Better Performance:
- Build artifacts excluded by default
- Temporary files automatically ignored
- Log files and dumps excluded
- IDE and OS files filtered out

### 🔍 **Troubleshooting Common Issues**

#### "File too large" Error:
```bash
# Remove large file from history
git filter-branch --index-filter 'git rm --cached --ignore-unmatch large-file.ext'

# Alternative: Use BFG Repo Cleaner
java -jar bfg.jar --strip-blobs-bigger-than 50M
```

#### Accidentally Committed Secrets:
```bash
# Remove from history (DANGER: rewrites history)
git filter-branch --force --index-filter \
'git rm --cached --ignore-unmatch .env' \
--prune-empty --tag-name-filter cat -- --all

# Change all affected secrets immediately!
```

#### Line Ending Issues:
```bash
# Fix line endings for all files
git add . -u
git commit -m "fix: normalize line endings"
```

### 📚 **Additional Resources**

#### Git Configuration Files in This Project:
- **`.gitignore`**: Comprehensive exclusion patterns
- **`.gitattributes`**: File type handling and line endings
- **`.gitkeep`**: Preserve empty directories
- **`docs/GIT_BEST_PRACTICES.md`**: This guide

#### Useful Git Aliases:
```bash
# Add to ~/.gitconfig
[alias]
    st = status
    co = checkout
    br = branch
    cm = commit -m
    pom = push origin main
    pod = push origin develop
    last = log -1 HEAD
    visual = !gitk
    tree = log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit
```

### ⚠️ **Important Reminders**

1. **Never commit secrets**: Use environment variables and .env files
2. **Review before pushing**: Always check `git status` and `git diff --cached`
3. **Keep commits atomic**: One logical change per commit
4. **Write clear commit messages**: Help future developers understand changes
5. **Use .gitignore proactively**: Better to exclude too much than too little
6. **Regular maintenance**: Run `git gc` and clean up branches periodically
7. **Backup important branches**: Use `git push origin backup-branch-name`

### 🎯 **Project-Specific Considerations**

#### MentraOS Development:
- **API keys**: Never commit `MENTRAOS_API_KEY`
- **ngrok URLs**: Don't hardcode in source files
- **User preferences**: Keep test data separate from real user data
- **AI models**: Use Git LFS for models > 25MB
- **Session data**: Never commit Redis dumps or session files

#### Multi-Platform Development:
- **Platform-specific builds**: Exclude platform build directories
- **Mobile certificates**: Never commit signing certificates
- **Environment configs**: Use template files instead of actual configs

---

**Remember**: A well-configured Git repository is the foundation of effective collaboration and secure development! 🚀