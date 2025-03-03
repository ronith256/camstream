from setuptools import setup, find_packages

setup(
    name="camstream",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        # Core web framework
        "fastapi>=0.109.2",
        "uvicorn[standard]>=0.27.1",
        "websockets>=12.0",
        "python-multipart>=0.0.6",
        "pydantic>=2.6.1",
        "pydantic-settings>=2.1.0",
        
        # Async utilities
        "aiofiles>=23.2.1",
        "asyncio>=3.4.3",
        
        # File operations
        "python-dotenv>=1.0.1",
        
        # Camera and image processing
        "opencv-python>=4.9.0.80",
        "numpy>=1.26.3",
        
        # WebRTC
        "aiortc>=1.5.0",
        "av>=11.0.0",  # Required by aiortc for media handling
        "cryptography>=41.0.0",  # Required for secure connections
        "pyopenssl>=23.0.0",  # Required for secure connections
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-asyncio>=0.21.1",
            "httpx>=0.25.0",
            "black>=24.1.0",
            "isort>=5.12.0",
            "flake8>=7.0.0",
        ],
    },
    python_requires=">=3.8",
    description="Real-time camera streaming application with WebRTC for edge devices",
    author="Ronith",
    author_email="your.email@example.com",
    url="https://github.com/ronith256/camstream",
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Topic :: Multimedia :: Video :: Capture",
        "Topic :: Multimedia :: Video :: Display",
    ],
    entry_points={
        "console_scripts": [
            "camstream=app.main:start_application",
        ],
    },
    package_data={
        "app": ["config/*.json", "static/*"],
    },
)