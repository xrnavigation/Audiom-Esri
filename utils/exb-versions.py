"""
ArcGIS Experience Builder Version Compatibility Fetcher

This module dynamically fetches and parses version compatibility information
from the ArcGIS Experience Builder documentation.
"""

from typing import Optional
from dataclasses import dataclass
import sys
import argparse
import requests
from bs4 import BeautifulSoup


@dataclass(frozen=True)
class ExBVersionInfo:
    """Strictly-typed class representing version compatibility information."""
    
    exb_version: str
    jsapi_version: str
    enterprise_version: Optional[str]
    dev_edition_version: str
    release_date: str
    arcgis_api_version: Optional[str]
    recommended_node_major: int
    typescript_version: int
    
    def print(self) -> None:
        """Print formatted version information."""
        print("\n" + "=" * 60)
        print(f"ArcGIS Experience Builder Version {self.exb_version}")
        print("=" * 60)
        print(f"  JSAPI Version:        {self.jsapi_version}")
        print(f"  Enterprise Version:   {self.enterprise_version or 'N/A'}")
        print(f"  Dev Edition:          {self.dev_edition_version}")
        print(f"  Release Date:         {self.release_date}")
        print(f"  ArcGIS API Version:   {self.arcgis_api_version or 'N/A'}")
        print(f"  Recommended Node.js:  {self.recommended_node_major}")
        print(f"  TypeScript Version:   {self.typescript_version}")
        print("=" * 60 + "\n")
    
    def __str__(self) -> str:
        """Compact string representation of version info."""
        return (
            f"ExB {self.exb_version}: "
            f"JSAPI {self.jsapi_version}, "
            f"Node {self.recommended_node_major}, "
            f"TypeScript {self.typescript_version}"
        )


class ExBVersionFetcher:
    """Fetches and parses ArcGIS Experience Builder version information."""
    
    URL = "https://developers.arcgis.com/experience-builder/guide/release-versions/"
    
    def __init__(self, timeout: int = 10):
        """
        Initialize the version fetcher.
        
        Args:
            timeout: Request timeout in seconds
        """
        self.timeout = timeout
        self._versions_cache: Optional[list[ExBVersionInfo]] = None
    
    def fetch_versions(self, force_refresh: bool = False) -> list[ExBVersionInfo]:
        """
        Fetch all version information from the web page.
        
        Args:
            force_refresh: Force a fresh fetch instead of using cache
            
        Returns:
            list of ExBVersionInfo objects sorted by version (newest first)
            
        Raises:
            requests.RequestException: If the request fails
            ValueError: If parsing fails
        """
        if self._versions_cache is not None and not force_refresh:
            return self._versions_cache
        
        response = requests.get(self.URL, timeout=self.timeout)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        versions = self._parse_version_table(soup)
        
        self._versions_cache = versions
        return versions
    
    def _parse_version_table(self, soup: BeautifulSoup) -> list[ExBVersionInfo]:
        """
        Parse the version compatibility table from the HTML.
        
        Args:
            soup: BeautifulSoup object containing the page HTML
            
        Returns:
            list of ExBVersionInfo objects
            
        Raises:
            ValueError: If table parsing fails
        """
        versions: list[ExBVersionInfo] = []
        
        # Find all table rows - the data is in a markdown-style table
        tables = soup.find_all('table')
        
        for table in tables:
            rows = table.find_all('tr')
            
            # Skip header row
            for row in rows[1:]:
                cols = row.find_all('td')
                
                if len(cols) < 8:
                    continue
                
                try:
                    # Extract and clean text from each column
                    exb_version = cols[0].get_text(strip=True)
                    jsapi_version = cols[1].get_text(strip=True)
                    enterprise_version = cols[2].get_text(strip=True) or None
                    dev_edition = cols[3].get_text(strip=True)
                    release_date = cols[4].get_text(strip=True)
                    arcgis_api = cols[5].get_text(strip=True) or None
                    node_version = cols[6].get_text(strip=True)
                    typescript_version = cols[7].get_text(strip=True)
                    
                    # Skip empty rows or header rows
                    if not exb_version or not exb_version[0].isdigit():
                        continue
                    
                    version_info = ExBVersionInfo(
                        exb_version=exb_version,
                        jsapi_version=jsapi_version,
                        enterprise_version=enterprise_version if enterprise_version else None,
                        dev_edition_version=dev_edition,
                        release_date=release_date,
                        arcgis_api_version=arcgis_api if arcgis_api else None,
                        recommended_node_major=int(node_version),
                        typescript_version=int(typescript_version)
                    )
                    
                    versions.append(version_info)
                    
                except (ValueError, IndexError):
                    # Skip malformed rows
                    continue
        
        if not versions:
            raise ValueError("Failed to parse version table - no valid data found")
        
        return versions
    
    def get_version_info(self, exb_version: str) -> Optional[ExBVersionInfo]:
        """
        Get version compatibility information for a specific ExB version.
        
        Args:
            exb_version: Experience Builder version (e.g., "1.19", "1.18")
            
        Returns:
            ExBVersionInfo object if found, None otherwise
        """
        versions = self.fetch_versions()
        
        for version in versions:
            if version.exb_version == exb_version:
                return version
        
        return None
    
    def get_latest_version(self) -> ExBVersionInfo:
        """
        Get the latest (most recent) version information.
        
        Returns:
            ExBVersionInfo object for the latest version
            
        Raises:
            ValueError: If no versions are available
        """
        versions = self.fetch_versions()
        
        if not versions:
            raise ValueError("No version information available")
        
        # Versions should be sorted newest first based on table order
        return versions[0]
    
    def get_versions_for_node(self, node_major: int) -> list[ExBVersionInfo]:
        """
        Get all ExB versions compatible with a specific Node.js major version.
        
        Args:
            node_major: Node.js major version (e.g., 22, 20, 18)
            
        Returns:
            list of compatible ExBVersionInfo objects
        """
        versions = self.fetch_versions()
        return [v for v in versions if v.recommended_node_major == node_major]
    
    def get_versions_for_enterprise(self, enterprise_version: str) -> list[ExBVersionInfo]:
        """
        Get all ExB versions compatible with a specific Enterprise version.
        
        Args:
            enterprise_version: ArcGIS Enterprise version (e.g., "11.4", "11.3")
            
        Returns:
            list of compatible ExBVersionInfo objects
        """
        versions = self.fetch_versions()
        return [
            v for v in versions 
            if v.enterprise_version == enterprise_version
        ]


def get_recommended_versions(exb_version: str) -> Optional[ExBVersionInfo]:
    """
    Get recommended versions for a given ExB version.
    
    Args:
        exb_version: Experience Builder version (e.g., "1.19", "1.18")
        
    Returns:
        ExBVersionInfo dataclass with all version compatibility information,
        or None if version not found
    """
    fetcher = ExBVersionFetcher()
    return fetcher.get_version_info(exb_version)


@dataclass
class CliArgs:
    """Strongly-typed CLI arguments."""
    exb_version: Optional[str]
    node_version: bool
    jsapi_version: bool
    enterprise_version: bool
    dev_edition: bool
    typescript_version: bool
    arcgis_api_version: bool
    release_date: bool


# Argument keys used for argparse
ARG_EXB_VERSION: str = 'exb_version'
ARG_NODE_VERSION: str = 'node_version'
ARG_JSAPI_VERSION: str = 'jsapi_version'
ARG_ENTERPRISE_VERSION: str = 'enterprise_version'
ARG_DEV_EDITION: str = 'dev_edition'
ARG_TYPESCRIPT_VERSION: str = 'typescript_version'
ARG_ARCGIS_API_VERSION: str = 'arcgis_api_version'
ARG_RELEASE_DATE: str = 'release_date'


def parse_args() -> CliArgs:
    """Parse and return strongly-typed command-line arguments."""
    parser = argparse.ArgumentParser(
        description='Get ArcGIS Experience Builder version compatibility information',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python exb-versions.py 1.18
  python exb-versions.py 1.19 --node-version
  python exb-versions.py 1.18 --jsapi-version
  python exb-versions.py 1.17 --enterprise-version
  python exb-versions.py 1.19 --typescript-version
        """
    )
    
    parser.add_argument(ARG_EXB_VERSION, nargs='?', help='Experience Builder version (e.g., 1.18, 1.19)')
    parser.add_argument('--node-version', dest=ARG_NODE_VERSION, action='store_true', help='Output only the recommended Node.js major version')
    parser.add_argument('--jsapi-version', dest=ARG_JSAPI_VERSION, action='store_true', help='Output only the JSAPI version')
    parser.add_argument('--enterprise-version', dest=ARG_ENTERPRISE_VERSION, action='store_true', help='Output only the Enterprise version')
    parser.add_argument('--dev-edition', dest=ARG_DEV_EDITION, action='store_true', help='Output only the Dev Edition version')
    parser.add_argument('--typescript-version', dest=ARG_TYPESCRIPT_VERSION, action='store_true', help='Output only the TypeScript version')
    parser.add_argument('--arcgis-api-version', dest=ARG_ARCGIS_API_VERSION, action='store_true', help='Output only the ArcGIS API version')
    parser.add_argument('--release-date', dest=ARG_RELEASE_DATE, action='store_true', help='Output only the release date')
    
    namespace = parser.parse_args()
    namespace_dict = vars(namespace)
    
    return CliArgs(
        exb_version=namespace_dict[ARG_EXB_VERSION],
        node_version=namespace_dict[ARG_NODE_VERSION],
        jsapi_version=namespace_dict[ARG_JSAPI_VERSION],
        enterprise_version=namespace_dict[ARG_ENTERPRISE_VERSION],
        dev_edition=namespace_dict[ARG_DEV_EDITION],
        typescript_version=namespace_dict[ARG_TYPESCRIPT_VERSION],
        arcgis_api_version=namespace_dict[ARG_ARCGIS_API_VERSION],
        release_date=namespace_dict[ARG_RELEASE_DATE]
    )


def main() -> None:
    """Command-line interface for the version fetcher."""
    
    args: CliArgs = parse_args()
    
    if args.exb_version:
        # User provided an ExB version
        version_info = get_recommended_versions(args.exb_version)
        
        if not version_info:
            print(f"Error: Version {args.exb_version} not found.", file=sys.stderr)
            print("\nAvailable versions:", file=sys.stderr)
            fetcher = ExBVersionFetcher()
            all_versions = fetcher.fetch_versions()
            for v in all_versions[:5]:  # Show first 5
                print(f"  - {v.exb_version}", file=sys.stderr)
            if len(all_versions) > 5:
                print(f"  ... and {len(all_versions) - 5} more", file=sys.stderr)
            sys.exit(1)
        
        # Check if user wants filtered output
        if args.node_version:
            print(version_info.recommended_node_major)
        elif args.jsapi_version:
            print(version_info.jsapi_version)
        elif args.enterprise_version:
            print(version_info.enterprise_version or '')
        elif args.dev_edition:
            print(version_info.dev_edition_version)
        elif args.typescript_version:
            print(version_info.typescript_version)
        elif args.arcgis_api_version:
            print(version_info.arcgis_api_version or '')
        elif args.release_date:
            print(version_info.release_date)
        else:
            # No filter specified - show full output
            version_info.print()
    else:
        # No argument provided - show interactive demo
        print("ArcGIS Experience Builder Version Compatibility Tool")
        print("=" * 60)
        print("\nUsage: python exb-versions.py <version> [--filter]")
        print("Example: python exb-versions.py 1.18")
        print("         python exb-versions.py 1.19 --node-version\n")
        
        # Show latest version as example
        print("Fetching latest version as example...\n")
        fetcher = ExBVersionFetcher()
        latest = fetcher.get_latest_version()
        latest.print()
        
        print("\nAvailable versions:")
        all_versions = fetcher.fetch_versions()
        for v in all_versions:
            print(f"  - {v.exb_version}")


if __name__ == "__main__":
    main()
