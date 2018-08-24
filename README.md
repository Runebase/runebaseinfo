# runebaseinfo

## install

### mongodb
https://docs.mongodb.com/manual/tutorial/install-mongodb-on-ubuntu/

```
sudo apt-get update
sudo apt-get install libcurl3 openssl
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 9DA31620334BD75D9DCB49F368818C72E52529D4
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu xenial/mongodb-org/4.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
echo "mongodb-org hold" | sudo dpkg --set-selections
echo "mongodb-org-server hold" | sudo dpkg --set-selections
echo "mongodb-org-shell hold" | sudo dpkg --set-selections
echo "mongodb-org-mongos hold" | sudo dpkg --set-selections
echo "mongodb-org-tools hold" | sudo dpkg --set-selections
sudo service mongod start

```

### runebase-bitcore
https://github.com/Runebase/runebase-bitcore

```
sudo apt-get install build-essential libtool autotools-dev automake pkg-config libssl-dev libevent-dev bsdmainutils git cmake libboost-all-dev
sudo apt-get install software-properties-common
sudo add-apt-repository ppa:bitcoin/bitcoin
sudo apt-get update
sudo apt-get install libdb4.8-dev libdb4.8++-dev

git clone https://github.com/runebase/runebase-bitcore --recursive
cd runebase-bitcore

# Note autogen will prompt to install some more dependencies if needed
./autogen.sh
./configure
make -j2

```

### runebaseinfo
```
git clone https://github.com/runebase/runebaseinfo
cd runebaseinfo
git checkout legacy-v0.0
npm i
npm i runebaseinfo-node
npm i runebaseinfo-api
sudo mkdir -p '/node/data'
sudo chown -R user:user /node/data

```

## publish
```
npm run lerna bootstrap
npm i runebaseinfo-node
npm run lerna publish --skip-git --skip-npm --force-publish * --yes

```

## start

### runebase-bitcore
```
cd
cd runebase-bitcore
src/runebased &

```
### API
```
$(npm bin)/runebaseinfo-node start

```

## Front-end

```
placeholder

```
