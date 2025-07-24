#!/bin/bash

rm -r ../streambed/shelly/imagej/static/imagej/dist/*
cp -r dist/* ../streambed/shelly/imagej/static/imagej/dist/

# Make the dist directory in streambed container if it doesn't exist
docker exec -it streambed sh -c 'if [ ! -d /var/www/staticfiles/imagej ]; then mkdir /var/www/staticfiles/imagej; fi'
docker exec -it streambed sh -c 'if [ ! -d /var/www/staticfiles/imagej/dist ]; then mkdir /var/www/staticfiles/imagej/dist; fi'

# Remove the contents of dist directory if it does exist
docker exec -it streambed sh -c 'if [ -d /var/www/staticfiles/imagej/dist ]; then rm -r /var/www/staticfiles/imagej/dist/*; fi'

docker cp dist/. streambed:/var/www/staticfiles/imagej/dist
if [ $? -ne 0 ]; then
    echo "Failed to copy dist directory to streambed"
    exit 1
fi

echo "Static ImageJ.js files deployed to streambed"