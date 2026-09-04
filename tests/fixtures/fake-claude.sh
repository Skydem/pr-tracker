#!/bin/sh
printf '%s\n' "$@" > "${FAKE_CLAUDE_ARGS_FILE:-/dev/null}"
case "${FAKE_CLAUDE_MODE:-success}" in
  success)
    printf '{"type":"result","subtype":"success","is_error":false,"result":"### Code review\\n\\nFound 1 issue.","total_cost_usd":1.25,"num_turns":42,"session_id":"sess-1"}\n'
    ;;
  error_result)
    printf '{"type":"result","subtype":"error_max_turns","is_error":true,"result":"Reached max turns","total_cost_usd":0.5,"num_turns":10}\n'
    ;;
  crash)
    printf 'boom: something broke\n' >&2
    exit 3
    ;;
  hang)
    sleep 5
    ;;
esac
