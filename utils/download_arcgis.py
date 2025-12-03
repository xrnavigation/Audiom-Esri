import requests
import sys
from typing import Optional


def download_arcgis_builder(version: str = "1.19") -> bool:
    """
    Download ArcGIS Experience Builder for a specific version.

    Args:
        version: The version to download (e.g., "1.19")

    Returns:
        bool: True if download was successful, False otherwise
    """
    # Construct the API URL
    base_url: str = "https://downloads.arcgis.com/dms/rest/download/secured/"
    filename: str = f"arcgis-experience-builder-{version}.zip"
    api_url: str = f"{base_url}{filename}?f=json&folder=software%2FExperienceBuilder%2F{version}"

    print(f"Fetching download URL for version {version}...")

    try:
        # Get the API response
        response: requests.Response = requests.get(api_url)
        response.raise_for_status()

        data: dict[str, object] = response.json()

        # Check if the response contains an error
        if 'code' in data and data['code'] != 200:
            print(f"Error: {data.get('message', 'Unknown error')}")
            return False

        # Extract the download URL
        download_url: Optional[str] = data.get('url')
        if not download_url:
            print("Error: No download URL found in response")
            print(f"Response: {data}")
            return False

        print(f"Download URL: {download_url}")
        print(f"Downloading {filename}...")

        # Download the file
        download_response: requests.Response = requests.get(download_url, stream=True)
        download_response.raise_for_status()

        # Get total file size if available
        total_size: int = int(download_response.headers.get('content-length', 0))

        # Save the file
        with open(filename, 'wb') as f:
            if total_size == 0:
                f.write(download_response.content)
            else:
                downloaded: int = 0
                chunk_size: int = 8192
                chunk: bytes
                for chunk in download_response.iter_content(chunk_size=chunk_size):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        # Show progress
                        percent: float = (downloaded / total_size) * 100
                        print(f"\rProgress: {percent:.1f}% ({downloaded}/{total_size} bytes)", end='')

        print(f"\n\nSuccessfully downloaded {filename}")
        return True

    except requests.exceptions.RequestException as e:
        print(f"Error downloading file: {e}")
        return False
    except Exception as e:
        print(f"Unexpected error: {e}")
        return False


if __name__ == "__main__":
    # Get version from command line argument or use default
    version: str = sys.argv[1] if len(sys.argv) > 1 else "1.19"

    print(f"ArcGIS Experience Builder Downloader")
    print(f"=" * 50)

    success: bool = download_arcgis_builder(version)
    sys.exit(0 if success else 1)
