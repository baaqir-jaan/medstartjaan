import os
import requests
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route("/")
def home():
    return jsonify({"message": "Medicare Revenue Calculator API is running"})

port = os.environ.get("PORT", 5000)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=port)
