'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('address', {
      _id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
      },
      type: {
        type: Sequelize.TINYINT.UNSIGNED,
        allowNull: false
      },
      data: {
        type: Sequelize.STRING(32).BINARY,
        allowNull: false
      },
      string: {
        type: Sequelize.STRING(64),
        allowNull: false,
        charset: 'utf8',
        collate: 'utf8_bin'
      },
      create_height: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      uniqueKeys: {
        address: {
          fields: ['data', 'type']
        },
        string: {
          fields: ['string']
        }
      }
    });
    await queryInterface.addIndex('address', ['create_height'], {
      name: 'create_height'
    });
    await queryInterface.createTable('balance_change', {
      transaction_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      block_height: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      index_in_block: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      address_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      value: {
        type: Sequelize.BIGINT,
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      uniqueKeys: {
        address: {
          fields: ['address_id', 'block_height', 'index_in_block', 'transaction_id', 'value']
        }
      }
    });
    await queryInterface.createTable('block', {
      hash: {
        type: 'BINARY(32)',
        allowNull: false,
        unique: true
      },
      height: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      size: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      weight: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      miner_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false
      },
      transactions_count: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      contract_transactions_count: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });
    await queryInterface.addIndex('block', ['miner_id'], {
      name: 'miner'
    });
    await queryInterface.createTable('contract', {
      address: {
        type: 'BINARY(20)',
        allowNull: false,
        primaryKey: true
      },
      address_string: {
        type: Sequelize.CHAR(40),
        allowNull: false,
        charset: 'utf8',
        collate: 'utf8_bin',
        unique: true
      },
      vm: {
        type: Sequelize.ENUM('evm', 'x86'),
        allowNull: false,
        charset: 'utf8',
        collate: 'utf8_general_ci'
      },
      type: {
        type: Sequelize.ENUM('dgp', 'qrc20', 'qrc721'),
        allowNull: true,
        charset: 'utf8',
        collate: 'utf8_general_ci'
      },
      bytecode_sha256sum: {
        type: 'BINARY(32)',
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: ''
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });
    await queryInterface.addIndex('contract', ['bytecode_sha256sum'], {
      name: 'bytecode'
    });
    await queryInterface.createTable('contract_code', {
      sha256sum: {
        type: 'BINARY(32)',
        allowNull: false,
        primaryKey: true
      },
      code: {
        type: Sequelize.BLOB('medium'),
        allowNull: false
      },
      source: {
        type: Sequelize.TEXT('long'),
        allowNull: true
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      rowFormat: 'COMPACT'
    });
    await queryInterface.createTable('contract_spend', {
      source_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      dest_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });
    await queryInterface.addIndex('contract_spend', ['dest_id'], {
      name: 'dest'
    });
    await queryInterface.createTable('contract_tag', {
      _id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
      },
      contract_address: {
        type: 'BINARY(20)',
        allowNull: false
      },
      tag: {
        type: Sequelize.STRING(32),
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      rowFormat: 'COMPACT'
    });
    await queryInterface.addIndex('contract_tag', ['contract_address'], {
      name: 'contract'
    });
    await queryInterface.addIndex('contract_tag', ['tag'], {
      name: 'tag'
    });
    await queryInterface.createTable('evm_receipt', {
      _id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
      },
      transaction_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false
      },
      output_index: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      block_height: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      index_in_block: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      sender_type: {
        type: Sequelize.TINYINT.UNSIGNED,
        allowNull: false
      },
      sender_data: {
        type: Sequelize.STRING(32).BINARY,
        allowNull: false
      },
      gas_used: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      contract_address: {
        type: 'BINARY(20)',
        allowNull: false
      },
      excepted: {
        type: Sequelize.STRING(32),
        allowNull: false,
        charset: 'utf8',
        collate: 'utf8_general_ci'
      },
      excepted_message: {
        type: Sequelize.TEXT,
        allowNull: false
      }
    }, {
      charset: 'utf8',
      rowFormat: 'COMPACT'
    });
    await queryInterface.addIndex('evm_receipt', ['transaction_id', 'output_index'], {
      name: 'output',
      unique: true
    });
    await queryInterface.addIndex('evm_receipt', ['block_height', 'index_in_block', 'transaction_id', 'output_index'], {
      name: 'block',
      unique: true
    });
    await queryInterface.addIndex('evm_receipt', ['contract_address'], {
      name: 'contract'
    });
    await queryInterface.addIndex('evm_receipt', ['sender_data', 'sender_type'], {
      name: 'sender'
    });
    await queryInterface.createTable('evm_receipt_log', {
      _id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
      },
      receipt_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false
      },
      log_index: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      block_height: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      address: {
        type: 'BINARY(20)',
        allowNull: false
      },
      topic1: {
        type: Sequelize.STRING(32).BINARY,
        allowNull: true
      },
      topic2: {
        type: Sequelize.STRING(32).BINARY,
        allowNull: true
      },
      topic3: {
        type: Sequelize.STRING(32).BINARY,
        allowNull: true
      },
      topic4: {
        type: Sequelize.STRING(32).BINARY,
        allowNull: true
      },
      data: {
        type: Sequelize.BLOB,
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      rowFormat: 'COMPACT'
    });
    await queryInterface.addIndex('evm_receipt_log', ['receipt_id', 'log_index'], {
      name: 'log',
      unique: true
    });
    await queryInterface.addIndex('evm_receipt_log', ['block_height'], {
      name: 'block'
    });
    await queryInterface.addIndex('evm_receipt_log', ['address'], {
      name: 'contract'
    });
    await queryInterface.addIndex('evm_receipt_log', ['topic1'], {
      name: 'topic1'
    });
    await queryInterface.addIndex('evm_receipt_log', ['topic2'], {
      name: 'topic2'
    });
    await queryInterface.addIndex('evm_receipt_log', ['topic3'], {
      name: 'topic3'
    });
    await queryInterface.addIndex('evm_receipt_log', ['topic4'], {
      name: 'topic4'
    });
    await queryInterface.createTable('evm_receipt_mapping', {
      transaction_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      output_index: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      index_in_block: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      gas_used: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      contract_address: {
        type: 'BINARY(20)',
        allowNull: false
      },
      excepted: {
        type: Sequelize.STRING(32),
        allowNull: false,
        charset: 'utf8',
        collate: 'utf8_general_ci'
      },
      excepted_message: {
        type: Sequelize.TEXT,
        allowNull: false
      }
    }, {
      charset: 'utf8',
      rowFormat: 'COMPACT'
    });
    await queryInterface.createTable('gas_refund', {
      transaction_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      output_index: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      refund_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false
      },
      refund_index: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      rowFormat: 'COMPACT'
    });
    await queryInterface.addIndex('gas_refund', ['refund_id', 'refund_index'], {
      name: 'refund',
      unique: true
    });
    await queryInterface.createTable('header', {
      hash: {
        type: 'BINARY(32)',
        allowNull: false,
        unique: true
      },
      height: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      prev_hash: {
        type: 'BINARY(32)',
        allowNull: false
      },
      merkle_root: {
        type: 'BINARY(32)',
        allowNull: false
      },
      timestamp: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      bits: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      nonce: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      hash_state_root: {
        type: 'BINARY(32)',
        allowNull: false
      },
      hash_utxo_root: {
        type: 'BINARY(32)',
        allowNull: false
      },
      stake_prev_transaction_id: {
        type: 'BINARY(32)',
        allowNull: false
      },
      stake_output_index: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      signature: {
        type: Sequelize.BLOB,
        allowNull: false
      },
      chainwork: {
        type: 'BINARY(32)',
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });
    await queryInterface.addIndex('header', ['timestamp'], {
      name: 'timestamp'
    });
    await queryInterface.createTable('qrc20', {
      contract_address: {
        type: 'BINARY(20)',
        allowNull: false,
        primaryKey: true
      },
      name: {
        type: Sequelize.BLOB,
        allowNull: false
      },
      symbol: {
        type: Sequelize.BLOB,
        allowNull: false
      },
      decimals: {
        type: Sequelize.TINYINT.UNSIGNED,
        allowNull: false
      },
      total_supply: {
        type: 'BINARY(32)',
        allowNull: false
      },
      version: {
        type: Sequelize.BLOB,
        allowNull: true
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      rowFormat: 'COMPACT'
    });
    await queryInterface.createTable('qrc20_balance', {
      contract_address: {
        type: 'BINARY(20)',
        allowNull: false,
        primaryKey: true
      },
      address: {
        type: 'BINARY(20)',
        allowNull: false,
        primaryKey: true
      },
      balance: {
        type: 'BINARY(32)',
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });
    await queryInterface.addIndex('qrc20_balance', {
      fields: ['contract_address', {
        attribute: 'balance',
        order: 'DESC'
      }],
      name: 'rich_list'
    });
    await queryInterface.addIndex('qrc20_balance', ['address'], {
      name: 'address'
    });
    await queryInterface.createTable('qrc20_statistics', {
      contract_address: {
        type: 'BINARY(20)',
        allowNull: false,
        primaryKey: true
      },
      holders: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      transactions: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });
    await queryInterface.addIndex('qrc20_statistics', {
      fields: [{
        attribute: 'holders',
        order: 'DESC'
      }],
      name: 'holders'
    });
    await queryInterface.addIndex('qrc20_statistics', {
      fields: [{
        attribute: 'transactions',
        order: 'DESC'
      }],
      name: 'transactions'
    });
    await queryInterface.createTable('qrc721', {
      contract_address: {
        type: 'BINARY(20)',
        allowNull: false,
        primaryKey: true
      },
      name: {
        type: Sequelize.BLOB,
        allowNull: false
      },
      symbol: {
        type: Sequelize.BLOB,
        allowNull: false
      },
      total_supply: {
        type: 'BINARY(32)',
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      rowFormat: 'COMPACT'
    });
    await queryInterface.createTable('qrc721_token', {
      contract_address: {
        type: 'BINARY(20)',
        allowNull: false,
        primaryKey: true
      },
      token_id: {
        type: 'BINARY(32)',
        allowNull: false,
        primaryKey: true
      },
      holder: {
        type: 'BINARY(20)',
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      rowFormat: 'COMPACT'
    });
    await queryInterface.addIndex('qrc721_token', ['holder'], {
      name: 'owner'
    });
    await queryInterface.createTable('rich_list', {
      address_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      balance: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });
    await queryInterface.addIndex('rich_list', {
      fields: [{
        attribute: 'balance',
        order: 'DESC'
      }],
      name: 'balance'
    });
    await queryInterface.createTable('tip', {
      service: {
        type: Sequelize.STRING(32),
        allowNull: false,
        primaryKey: true,
        charset: 'utf8',
        collate: 'utf8_general_ci'
      },
      height: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      hash: {
        type: 'BINARY(32)',
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });
    await queryInterface.createTable('transaction', {
      _id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
      },
      id: {
        type: 'BINARY(32)',
        allowNull: false,
        unique: true
      },
      hash: {
        type: 'BINARY(32)',
        allowNull: false
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      flag: {
        type: Sequelize.TINYINT.UNSIGNED,
        allowNull: false
      },
      lock_time: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      block_height: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      index_in_block: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      size: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      weight: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });
    await queryInterface.addIndex('transaction', ['block_height', 'index_in_block', '_id'], {
      name: 'block',
      unique: true
    });
    await queryInterface.createTable('transaction_input', {
      transaction_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      input_index: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      scriptsig: {
        type: Sequelize.BLOB('medium'),
        allowNull: false
      },
      sequence: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      block_height: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      value: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      address_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false
      },
      output_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false
      },
      output_index: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      rowFormat: 'COMPACT'
    });
    await queryInterface.addIndex('transaction_input', ['address_id'], {
      name: 'address'
    });
    await queryInterface.addIndex('transaction_input', ['block_height'], {
      name: 'height'
    });
    await queryInterface.createTable('transaction_output', {
      transaction_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      output_index: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      scriptpubkey: {
        type: Sequelize.BLOB('medium'),
        allowNull: false
      },
      block_height: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      value: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      address_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false
      },
      is_stake: {
        type: Sequelize.BOOLEAN,
        allowNull: false
      },
      input_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false
      },
      input_index: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      input_height: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      rowFormat: 'COMPACT'
    });
    await queryInterface.addIndex('transaction_output', ['block_height'], {
      name: 'height'
    });
    await queryInterface.addIndex('transaction_output', ['address_id', 'input_height', 'block_height', 'value'], {
      name: 'address'
    });
    await queryInterface.createTable('transaction_output_mapping', {
      _id: {
        type: Sequelize.CHAR(32),
        allowNull: false,
        charset: 'utf8',
        collate: 'utf8_general_ci'
      },
      input_transaction_id: {
        type: 'BINARY(32)',
        allowNull: false
      },
      input_index: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      output_transaction_id: {
        type: 'BINARY(32)',
        allowNull: false
      },
      output_index: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      }
    }, {
      engine: 'MEMORY',
      charset: 'utf8'
    });
    await queryInterface.addIndex('transaction_output_mapping', ['_id'], {
      name: 'id'
    });
    await queryInterface.createTable('witness', {
      transaction_id: {
        type: 'BINARY(32)',
        allowNull: false,
        primaryKey: true
      },
      input_index: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      witness_index: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      script: {
        type: Sequelize.BLOB,
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      rowFormat: 'COMPACT'
    });
  },
  async down(queryInterface) {
    const tables = ['witness', 'transaction_output_mapping', 'transaction_output', 'transaction_input', 'transaction', 'tip', 'rich_list', 'qrc721_token', 'qrc721', 'qrc20_statistics', 'qrc20_balance', 'qrc20', 'header', 'gas_refund', 'evm_receipt_mapping', 'evm_receipt_log', 'evm_receipt', 'contract_tag', 'contract_spend', 'contract_code', 'contract', 'block', 'balance_change', 'address'];
    for (const table of tables) {
      await queryInterface.dropTable(table);
    }
  }
};