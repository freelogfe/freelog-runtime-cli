/** 顶层子命令与常用全局 flag（shell 补全真源） */
export const CLI_TOP_COMMANDS = [
  'login',
  'logout',
  'status',
  'validate',
  'doctor',
  'diff',
  'release',
  'type',
  'template',
  'init',
  'bind',
  'create',
  'resource',
  'publish',
  'draft',
  'dep',
  'version',
  'policy',
  'online',
  'offline',
  'update',
  'pull',
  'collection',
  'cover',
  'lang',
  'completion',
  'config',
  'workspace',
] as const;

export const CLI_GLOBAL_FLAGS = [
  '--env',
  '--test',
  '--json',
  '--yes',
  '-y',
  '--help',
  '-h',
  '--debug',
  '--lang',
  '--cwd',
  '--no-auto-pull',
] as const;

export const CLI_ENV_VALUES = ['dev', 'test', 'prod', 'production'] as const;

export const CLI_TYPE_SUBCOMMANDS = ['list', 'search', 'info', 'pick'] as const;
export const CLI_DRAFT_SUBCOMMANDS = ['push', 'pull', 'discard'] as const;
export const CLI_INIT_PRESETS = ['theme', 'widget', 'package'] as const;
export const CLI_COLLECTION_ITEM_SUBCOMMANDS = [
  'add',
  'import-dir',
  'remove',
  'update',
  'reorder',
] as const;
export const CLI_COLLECTION_RSS_SUBCOMMANDS = [
  'inspect',
  'status',
  'send-code',
  'bind',
  'sync',
] as const;

export function generateBashCompletion(): string {
  const cmds = CLI_TOP_COMMANDS.join(' ');
  const flags = CLI_GLOBAL_FLAGS.join(' ');
  const envs = CLI_ENV_VALUES.join(' ');
  const typeSubs = CLI_TYPE_SUBCOMMANDS.join(' ');
  const draftSubs = CLI_DRAFT_SUBCOMMANDS.join(' ');
  const initPresets = CLI_INIT_PRESETS.join(' ');
  const itemSubs = CLI_COLLECTION_ITEM_SUBCOMMANDS.join(' ');
  const rssSubs = CLI_COLLECTION_RSS_SUBCOMMANDS.join(' ');
  return `# freelog-cli bash completion
# Usage: eval "$(freelog-cli completion bash)"

_freelog_cli() {
  local cur prev cword
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  cword=$COMP_CWORD

  if [[ "$cur" == -* ]]; then
    COMPREPLY=( $(compgen -W "${flags} --resource-type --bump --build-cmd --for --dry-run --json-lines" -- "$cur") )
    return 0
  fi

  if [[ $cword -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${cmds}" -- "$cur") )
    return 0
  fi

  case "\${COMP_WORDS[1]}" in
    resource)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "import-dir search" -- "$cur") )
      fi
      ;;
    version)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "set bump edit show" -- "$cur") )
      fi
      ;;
    collection)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "create update publish item policy rss collect-rules logs init-from-folder version properties" -- "$cur") )
      elif [[ $cword -eq 3 && "\${COMP_WORDS[2]}" == "item" ]]; then
        COMPREPLY=( $(compgen -W "${itemSubs}" -- "$cur") )
      elif [[ $cword -eq 3 && "\${COMP_WORDS[2]}" == "rss" ]]; then
        COMPREPLY=( $(compgen -W "${rssSubs}" -- "$cur") )
      fi
      ;;
    type)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${typeSubs}" -- "$cur") )
      fi
      ;;
    draft)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${draftSubs}" -- "$cur") )
      fi
      ;;
    init)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${initPresets}" -- "$cur") )
      fi
      ;;
    config)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "show set init" -- "$cur") )
      fi
      ;;
    workspace)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "list" -- "$cur") )
      fi
      ;;
    policy)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "init apply list set" -- "$cur") )
      fi
      ;;
    dep)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "add remove list update auth init-auth-map" -- "$cur") )
      fi
      ;;
    completion)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "bash zsh" -- "$cur") )
      fi
      ;;
    login|publish|create|bind|release|validate|doctor|diff|online|offline|update|pull|status)
      COMPREPLY=( $(compgen -W "${flags}" -- "$cur") )
      ;;
  esac

  if [[ "$prev" == "--env" ]]; then
    COMPREPLY=( $(compgen -W "${envs}" -- "$cur") )
  fi
}

complete -F _freelog_cli freelog-cli
`;
}

export function generateZshCompletion(): string {
  const cmdList = CLI_TOP_COMMANDS.map((c) => `'${c}'`).join(' ');
  const typeList = CLI_TYPE_SUBCOMMANDS.map((c) => `'${c}'`).join(' ');
  const draftList = CLI_DRAFT_SUBCOMMANDS.map((c) => `'${c}'`).join(' ');
  const initList = CLI_INIT_PRESETS.map((c) => `'${c}'`).join(' ');
  const itemList = CLI_COLLECTION_ITEM_SUBCOMMANDS.map((c) => `'${c}'`).join(' ');
  const rssList = CLI_COLLECTION_RSS_SUBCOMMANDS.map((c) => `'${c}'`).join(' ');
  return `# freelog-cli zsh completion
# Usage: eval "$(freelog-cli completion zsh)"

#compdef freelog-cli

_freelog_cli() {
  local -a commands global_flags env_values
  commands=(${cmdList})
  global_flags=(--env --test --json --yes -y --help -h --debug --lang --cwd --no-auto-pull)
  env_values=(dev test prod production)

  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi

  case $words[2] in
    resource)
      if (( CURRENT == 3 )); then
        _values 'subcommand' 'import-dir' 'search'
      fi
      ;;
    version)
      if (( CURRENT == 3 )); then
        _values 'subcommand' 'set' 'bump' 'edit' 'show'
      fi
      ;;
    collection)
      if (( CURRENT == 3 )); then
        _values 'subcommand' 'create' 'update' 'publish' 'item' 'policy' 'rss' 'collect-rules' 'logs' 'init-from-folder' 'version' 'properties'
      elif (( CURRENT == 4 )); then
        case $words[3] in
          item) _values 'subcommand' ${itemList} ;;
          rss) _values 'subcommand' ${rssList} ;;
        esac
      fi
      ;;
    type)
      if (( CURRENT == 3 )); then
        _values 'subcommand' ${typeList}
      fi
      ;;
    draft)
      if (( CURRENT == 3 )); then
        _values 'subcommand' ${draftList}
      fi
      ;;
    init)
      if (( CURRENT == 3 )); then
        _values 'subcommand' ${initList}
      fi
      ;;
    config)
      if (( CURRENT == 3 )); then
        _values 'subcommand' 'show' 'set' 'init'
      fi
      ;;
    workspace)
      if (( CURRENT == 3 )); then
        _values 'subcommand' 'list'
      fi
      ;;
    policy)
      if (( CURRENT == 3 )); then
        _values 'subcommand' 'init' 'apply' 'list' 'set'
      fi
      ;;
    dep)
      if (( CURRENT == 3 )); then
        _values 'subcommand' 'add' 'remove' 'list' 'update' 'auth' 'init-auth-map'
      fi
      ;;
    completion)
      if (( CURRENT == 3 )); then
        _values 'shell' 'bash' 'zsh'
      fi
      ;;
  esac

  if [[ $words[CURRENT-1] == --env ]]; then
    _describe 'env' env_values
    return
  fi

  _describe 'flag' global_flags
}

compdef _freelog_cli freelog-cli
`;
}
