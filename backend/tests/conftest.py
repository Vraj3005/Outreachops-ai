import os
import sys

# Set test environment mode
os.environ["ENV"] = "test"

# Add backend app directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
