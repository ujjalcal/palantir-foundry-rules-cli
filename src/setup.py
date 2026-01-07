from setuptools import setup, find_packages

setup(
    name="foundry-rules-cli",
    version="1.0.1",
    packages=find_packages(),
    install_requires=[
        "pydantic>=2.0.0",
        "httpx>=0.25.0",
    ],
    python_requires=">=3.10",
)
