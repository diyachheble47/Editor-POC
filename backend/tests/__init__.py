import os

# Tests never write a log file (the console lines are still captured by the tests that look at them).
os.environ.setdefault("LOG_FILE", "0")
os.environ.setdefault("LITELLM_BASE_URL", "http://localhost:4000")  # a key alone does not make the AI "set up"
