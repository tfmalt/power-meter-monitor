#!/bin/bash

echo "Running install script"
echo "  prefix:" $npm_config_prefix
echo "  global:" $npm_config_global
echo "  links:" $npm_config_bin_links

if [[ $npm_config_global == "true" ]]; then
    echo "Doing global install"
else
    echo "Only doing local install"
fi
